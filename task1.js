const { chromium } = require('playwright');
const fs = require('fs');

const BASE_URL =
    'https://citydev-portal.edinburgh.gov.uk/idoxpa-web/scottishBuildingWarrantDetails.do?keyVal=T1A67ZEWK0T00';

/**
 * Generic "key → value" table scraper.
 * It converts the left column into a normalized key
 * and the right column into a value.
 */
async function scrapeTable(page, selector) {
    await page.waitForSelector(selector);

    const rows = await page.$$eval(`${selector} tr`, (trs) => {
        const result = [];

        for (const tr of trs) {
            const cells = tr.querySelectorAll('th, td');
            if (cells.length >= 2) {
                const key = cells[0].innerText.trim().replace(/:$/, '');
                const value = cells[1].innerText.trim();
                if (key) {
                    result.push({ key, value });
                }
            }
        }

        return result;
    });

    const data = {};
    for (const { key, value } of rows) {
        const normalizedKey = key
            .toLowerCase()
            .replace(/[^a-z0-9]+/gi, '_')
            .replace(/^_+|_+$/g, '');
        data[normalizedKey] = value;
    }

    return data;
}

/**
 * SUMMARY TAB
 */
async function scrapeSummary(page) {
    const url = `${BASE_URL}&activeTab=summary`;
    await page.goto(url, { waitUntil: 'networkidle' });

    const header = await page.$eval('.addressCrumb', (el) => {
        const caseNumber = el.querySelector('.caseNumber')?.innerText.trim() || null;
        const description = el.querySelector('.description')?.innerText.trim() || null;
        const address = el.querySelector('.address')?.innerText.trim() || null;
        return { caseNumber, description, address };
    });

    const summary = await scrapeTable(page, '#simpleDetailsTable');

    const casesRaw = await page
        .$eval('p.associatedcase', (el) => el.innerText.trim())
        .catch(() => null);

    let casesCount = null;
    if (casesRaw) {
        const m = casesRaw.match(/(\d+)/);
        if (m) casesCount = Number(m[1]);
    }

    const propertiesRaw = await page
        .$eval('p.associatedproperty', (el) => el.innerText.trim())
        .catch(() => null);

    let propertiesCount = null;
    let propertyUrl = null;

    if (propertiesRaw) {
        const m = propertiesRaw.match(/(\d+)/);
        if (m) propertiesCount = Number(m[1]);

        const href = await page
            .$eval('p.associatedproperty a', (a) => a.getAttribute('href'))
            .catch(() => null);

        if (href) {
            const base = new URL(url);
            propertyUrl = new URL(href, base).toString();
        }
    }

    return {
        header,
        summary,
        cases: {
            raw_text: casesRaw,
            count: casesCount,
        },
        properties: {
            raw_text: propertiesRaw,
            count: propertiesCount,
            url: propertyUrl,
        },
    };
}

/**
 * FURTHER INFORMATION SUBTAB
 */
async function scrapeFurtherInformation(page) {
    const url = `${BASE_URL}&activeTab=details`;
    await page.goto(url, { waitUntil: 'networkidle' });

    const details = await scrapeTable(page, '#buildingStandardsDetails');
    return details;
}

/**
 * PLOTS SUBTAB
 */
async function scrapePlots(page) {
    const url = `${BASE_URL}&activeTab=plots`;
    await page.goto(url, { waitUntil: 'networkidle' });

    const plotOptions = await page.$$eval('#plotDesc option', (opts) =>
        opts.map((o) => ({
            value: o.value,
            label: o.textContent.trim(),
            selected: o.selected,
        })),
    );

    const plots = {};

    for (const opt of plotOptions) {
        // Skip "All" option (empty value)
        if (!opt.value) continue;

        // If this plot is not selected, select it and submit the form
        if (!opt.selected) {
            await page.selectOption('#plotDesc', opt.value);
            await Promise.all([
                page.click('#bsPlotsDesc input[type="submit"]'),
                page.waitForNavigation({ waitUntil: 'networkidle' }),
            ]);
        }

        const description = await page
            .$eval('.tabcontainer p b', (el) => el.innerText.trim())
            .catch(() => null);

        const tableData = await scrapeTable(
            page,
            '.tabcontainer table[summary*="Building Standards Application Plots"]',
        );

        plots[opt.value] = {
            label: opt.label,
            description,
            details: tableData,
        };
    }

    return {
        options: plotOptions,
        plots,
    };
}

/**
 * IMPORTANT DATES SUBTAB
 */
async function scrapeImportantDates(page) {
    const url = `${BASE_URL}&activeTab=dates`;
    await page.goto(url, { waitUntil: 'networkidle' });

    const dates = await scrapeTable(page, '#simpleDetailsTable');
    return dates;
}

/**
 * CERTIFICATES TAB (all subtabs)
 * - Certificates of Design
 * - Certificates of Construction
 * - Energy Performance Certificates
 * - Completion Certificates
 */
async function scrapeCertificates(page) {
    const url = `${BASE_URL}&activeTab=designCertificate`;
    await page.goto(url, { waitUntil: 'networkidle' });

    // Read all certificate subtabs and their URLs
    const subtabLinks = await page.$$eval('.subtabs a', (links) =>
        links.map((l) => ({
            text: l.textContent.trim(),
            href: l.getAttribute('href'),
        })),
    );

    const certificates = {};

    for (const link of subtabLinks) {
        const subUrl = new URL(link.href, BASE_URL).toString();
        await page.goto(subUrl, { waitUntil: 'networkidle' });

        const key = link.text
            .toLowerCase()
            .replace(/[^a-z0-9]+/gi, '_')
            .replace(/^_+|_+$/g, '');

        const tableElement = await page.$('.tabcontainer table');
        let table = null;

        if (tableElement) {
            table = await scrapeTable(page, '.tabcontainer table');
        }

        // Fallback text (for “There are no certificates …” messages)
        const message = await page
            .$eval('.tabcontainer', (el) => el.innerText.trim())
            .catch(() => null);

        // Extra data only for "Certificates of Design" (plots list)
        let appliesToPlots = null;
        if (key === 'certificates_of_design') {
            appliesToPlots = await page
                .$$eval('.tabcontainer a', (links) =>
                    Array.from(links).map((a) => ({
                        text: a.textContent.trim(),
                        href: a.getAttribute('href'),
                    })),
                )
                .catch(() => []);
        }

        certificates[key] = {
            title: link.text,
            url: subUrl,
            table,
            message,
            applies_to_plots: appliesToPlots,
        };
    }

    return certificates;
}

/**
 * RELATED ITEMS TAB
 */
async function scrapeRelatedItems(page) {
    const url = `${BASE_URL}&activeTab=relatedCases`;
    await page.goto(url, { waitUntil: 'networkidle' });

    const sections = await page
        .$$eval('.tabcontainer h2', (headings) => {
            const result = [];

            for (const h of headings) {
                const title = h.textContent.trim();
                const section = { title, items: [] };

                let node = h.nextElementSibling;

                // Collect everything until the next <h2> (or end)
                while (node && node.tagName.toLowerCase() !== 'h2') {
                    const links = node.querySelectorAll('a');

                    if (links.length === 0) {
                        const text = node.textContent.trim();
                        if (text) {
                            section.items.push({ text, href: null });
                        }
                    } else {
                        links.forEach((a) => {
                            section.items.push({
                                text: a.textContent.trim(),
                                href: a.getAttribute('href'),
                            });
                        });
                    }

                    node = node.nextElementSibling;
                }

                result.push(section);
            }

            return result;
        })
        .catch(() => []);

    return {
        url,
        sections,
    };
}

/**
 * MAP TAB
 * We collect:
 * - map tab URL
 * - iframe URL (actual map application URL)
 * - form action + hidden parameters used to load the map
 * - copyright text
 */
async function scrapeMap(page) {
    const url = `${BASE_URL}&activeTab=map`;

    // We wrap the whole logic in try/catch so that any timeout
    // on the map tab does NOT break the whole scraper.
    try {
        // "networkidle" is too strict for pages with maps/analytics,
        // so we only wait for DOMContentLoaded and give it more time.
        await page.goto(url, {
            waitUntil: 'domcontentloaded',
            timeout: 60000,
        });

        const formAction = await page
            .$eval('#mapForm', (form) => form.getAttribute('action'))
            .catch(() => null);

        const formParams = await page
            .$$eval('#mapForm input[type="hidden"]', (inputs) => {
                const params = {};
                for (const input of inputs) {
                    if (input.name) params[input.name] = input.value;
                }
                return params;
            })
            .catch(() => null);

        let iframeUrl = null;
        const frame = page.frame({ name: 'mapiframe' });

        if (frame) {
            // Try to wait a bit for the iframe, but never fail on timeout
            try {
                await frame.waitForLoadState('domcontentloaded', { timeout: 10000 });
            } catch {
                // ignore iframe timeouts
            }
            const candidate = frame.url();
            if (candidate && candidate !== 'about:blank') {
                iframeUrl = candidate;
            }
        }

        const copyright = await page
            .$eval('#mapCopyright', (el) => el.innerText.trim())
            .catch(() => null);

        return {
            tab_url: url,
            iframe_url: iframeUrl,
            form_action: formAction,
            form_params: formParams,
            copyright,
        };
    } catch (err) {
        // If anything goes wrong on the Map tab, we return a minimal object
        // so the main scraper can still write result.json.
        console.error('Error while scraping map tab:', err);

        return {
            tab_url: url,
            iframe_url: null,
            form_action: null,
            form_params: null,
            copyright: null,
            error: String(err && err.message ? err.message : err),
        };
    }
}

/**
 * MAIN AGGREGATOR
 */
async function scrapeEdinburghAllTabs() {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    try {
        const summaryPart = await scrapeSummary(page);
        const furtherInfoPart = await scrapeFurtherInformation(page);
        const plotsPart = await scrapePlots(page);
        const importantDatesPart = await scrapeImportantDates(page);
        const certificatesPart = await scrapeCertificates(page);
        const relatedItemsPart = await scrapeRelatedItems(page);
        const mapPart = await scrapeMap(page);

        const result = {
            header: summaryPart.header,
            summary: summaryPart.summary,
            cases: summaryPart.cases,
            properties: summaryPart.properties,
            further_information: furtherInfoPart,
            plots: plotsPart,
            important_dates: importantDatesPart,
            certificates: certificatesPart,
            related_items: relatedItemsPart,
            map: mapPart,
        };

        console.log(JSON.stringify(result, null, 2));

        // ===== SAVE TO FILE =====
        fs.writeFileSync('result.json', JSON.stringify(result, null, 2));
        console.log('Saved to result.json');
    } catch (err) {
        console.error('Error during scraping:', err);
    } finally {
        await browser.close();
    }
}

// single entry point
scrapeEdinburghAllTabs();
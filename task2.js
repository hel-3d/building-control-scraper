// task2.js — scrape using Got v14+

import got from "got";
import { CookieJar } from "tough-cookie";
import * as cheerio from "cheerio";
import fs from "fs";

const BASE_URL = "https://wnc.planning-register.co.uk";
const DISCLAIMER_PATH =
    "Disclaimer?returnUrl=%2FBuildingControl%2FDisplay%2FFP%2F2025%2F0159";
const APPLICATION_PATH = "BuildingControl/Display/FP/2025/0159";

/**
 * Normalize a label into a machine-friendly key.
 * Example: "Reference Number" -> "reference_number"
 */
function normalizeKey(label) {
    return label
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");
}

/**
 * Scrape the "Main Details" tab.
 * It is rendered as a table with td.halfwidth / td.fullwidth.
 */
function scrapeMainDetails($) {
    const data = {};
    const rows = $("#Main-Details table.summaryTbl tr");

    rows.each((_, tr) => {
        $(tr)
            .find("td.halfwidth, td.fullwidth")
            .each((_, td) => {
                const html = $(td).html();
                if (!html) return;

                const keyText = $(td).contents().first().text().trim();
                const valueText = $(td).find("span").text().trim();

                if (keyText && valueText) {
                    data[normalizeKey(keyText)] = valueText;
                }
            });
    });

    return data;
}

/**
 * Scrape the "Plots" tab.
 * Result is an array of objects, one per row.
 */
function scrapePlots($) {
    const plots = [];
    const rows = $("#Plots table.summaryTbl tr").slice(1); // skip header row

    rows.each((_, tr) => {
        const cols = $(tr).find("td");
        if (!cols.length) return;

        plots.push({
            plot_number: $(cols[0]).text().trim(),
            plot_address: $(cols[1]).text().trim(),
            plot_status: $(cols[2]).text().trim(),
            commencement_date: $(cols[3]).text().trim(),
            completion_date: $(cols[4]).text().trim(),
        });
    });

    return plots;
}

/**
 * Scrape the "Site History" tab.
 */
function scrapeSiteHistory($) {
    const history = [];
    const rows = $("#Site-history table.tblResults tr").slice(2); // skip title + header

    rows.each((_, tr) => {
        const cols = $(tr).find("td");
        if (!cols.length) return;

        history.push({
            application_number: $(cols[0]).text().trim(),
            received_date: $(cols[1]).text().trim(),
            validated_date: $(cols[2]).text().trim(),
            application_type: $(cols[3]).text().trim(),
            location: $(cols[4]).text().trim(),
            proposal: $(cols[5]).text().trim(),
        });
    });

    return history;
}

/**
 * 1) Accept the disclaimer page so the application page becomes accessible.
 */
async function acceptDisclaimer(client) {
    const res = await client.get(`${BASE_URL}/${DISCLAIMER_PATH}`);
    const $ = cheerio.load(res.body);

    const form = $('form[action^="/Disclaimer/Accept"]').first();
    if (!form.length) throw new Error("Disclaimer form not found");

    const action = form.attr("action");
    if (!action) throw new Error("No form action found");

    // Collect hidden inputs (if any)
    const formData = {};
    form.find("input[type=hidden]").each((_, el) => {
        const name = $(el).attr("name");
        const val = $(el).attr("value") || "";
        if (name) formData[name] = val;
    });

    await client.post(`${BASE_URL}${action}`, { form: formData });
}

/**
 * 2) Load the building control page and extract all relevant data.
 */
async function fetchApplicationPage(client) {
    const res = await client.get(`${BASE_URL}/${APPLICATION_PATH}`);
    const $ = cheerio.load(res.body);

    const title = $("h1").first().text().trim();

    const mainDetails = scrapeMainDetails($);
    const plots = scrapePlots($);
    const siteHistory = scrapeSiteHistory($);

    return {
        url: `${BASE_URL}/${APPLICATION_PATH}`,
        title,
        main_details: mainDetails,
        plots,
        site_history: siteHistory,
    };
}

/**
 * MAIN ENTRY POINT
 */
async function run() {
    const cookieJar = new CookieJar();

    // Got v14 client
    const client = got.extend({
        cookieJar,
        headers: {
            "User-Agent": "Mozilla/5.0",
        },
    });

    try {
        console.log("Accepting disclaimer...");
        await acceptDisclaimer(client);

        console.log("Fetching application page...");
        const data = await fetchApplicationPage(client);

        console.log(JSON.stringify(data, null, 2));
        fs.writeFileSync("result_task2.json", JSON.stringify(data, null, 2));

        console.log("Saved to result_task2.json");
    } catch (err) {
        console.error("Error:", err);
    }
}

run();

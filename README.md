Building Control Scraper — Technical Test

This repository contains two independent Node.js scrapers developed for a coding test.
The tasks demonstrate browser automation, HTTP-level scraping, structured data extraction,
error handling, and producing clean JSON output.

Both scrapers are intentionally lightweight and dependency-minimal, using Playwright, Got v14, Cheerio, and Tough-Cookie.

---
Task 1 — Playwright Scraper (Scottish Building Warrant)

Goal:
Load the Scottish building warrant page using Playwright and extract as much relevant building-control data as possible, including all available tabs and sub-tabs.

What is scraped:
  * Summary information
  * Case and property metadata
  * Building standards details
  * Plots and their sub-details
  * Important dates
  * Design certificates
  * Related items (grouped by section)
  * Map tab information (incl. POST parameters used to load the geometry)

Geometry bonus:
The script extracts the map service endpoint and form parameters used by the ArcGIS ExperienceBuilder application.
These parameters allow retrieving geometry programmatically outside the browser.

Technologies:
✔ Playwright
✔ Cheerio
✔ Node.js 22

Output file:
result.json

Run:

npm run task1

Task 2 — Got Scraper (English/Welsh Building Control Register)

Goal:
Perform HTTP-level scraping using Got v14.
The page requires accepting a disclaimer before the actual building-control page becomes accessible.

Flow:
1) Load the disclaimer page
2) Parse the disclaimer form and POST it (simulate clicking Agree)
3) Retrieve the building control page with valid session cookies
4) Extract:
  * Main application fields
  * Plots table
  * Site history table
  * Long text sections (explanatory notices)

Technologies:
✔ Got v14
✔ Tough-Cookie (session persistence)
✔ Cheerio
✔ Node.js 22

Output file:
result_task2.json

Run:

npm run task2

---
Approach & Notes
  * Both tasks focus on clean structured data, using DOM traversal and normalised field names.
  * All selectors are defensive: missing blocks or unexpected markup do not break scraping.
  * Task 1 walks through every available tab, ensuring maximum data completeness.
  * Map geometry is not directly exposed in HTML, so the scraper collects the POST action + parameters, enabling downstream retrieval of spatial data.
  * Task 2 replicates the full authentication flow required by the site (Disclaimer → Session cookies → Data page).
  * Output files are written in a stable, predictable JSON structure for easy consumption.

How to run locally:
npm install
npm run task1
npm run task2


Node.js 20+ is recommended (tests were run using Node.js 22).

📂 Project structure
```
├── task1.js
├── task2.js
├── package.json
├── .gitignore
├── README.md
├── result.json            # output of task 1
└── result_task2.json      # output of task 2
```
📄 License

MIT — this repository is for demonstration and technical review purposes.

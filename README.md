# Building Control Scraper Test

This repository contains two small Node.js scrapers for the coding test:

- **Task 1** – Scrape a Scottish building warrant page using **Playwright**
- **Task 2** – Scrape an English/Welsh building control page using **Got**

The focus is on code quality, data completeness, error handling and documentation.

---

## Tech stack

- Node.js (tested with v20)
- [Playwright](https://www.npmjs.com/package/playwright) for Task 1
- [Got](https://www.npmjs.com/package/got) for Task 2

---

## How to run locally

```bash
git clone <this-repo-url>
cd building-control-scraper

npm install

# Task 1 (Playwright)
npm run task1   # or: node task1.js

# Task 2 (Got) – once implemented
npm run task2   # or: node task2.js

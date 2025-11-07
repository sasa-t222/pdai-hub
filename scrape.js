const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs/promises');
const path = require('path');

// --- Configuration: Define Sources and Selectors ---
const SOURCES = [
  // Site: learn.thedesignsystem.guide (example selectors)
  { name: "The Design System Guide", 
    url: "https://learn.thedesignsystem.guide/", 
    articleSelector: '.post-card', // Selector for the container of each article
    linkSelector: '.post-card-content a', // Link within the article container
    dateSelector: '.post-card-date'
  },
  // Site: builtformars.com/ux-bites (example selectors)
  { name: "Built For Mars UX Bites", 
    url: "https://builtformars.com/ux-bites", 
    articleSelector: '.post-card-item',
    linkSelector: 'a',
    dateSelector: '.post-date'
  },
  // Add other websites similarly...
  { name: "Growth Design", 
    url: "https://growth.design/case-studies", 
    articleSelector: '.case-study-card',
    linkSelector: 'a',
    dateSelector: '.date' 
  },
  // Placeholder for complex sources (like YouTube)
  { name: "Sneak Peek Design (Manual)", 
    url: "https://www.youtube.com/@sneakpeekdesign/videos", 
    isManual: true, 
    date: '2025-11-01', 
    title: 'Check the latest AI videos on Sneak Peek Design' 
  },
];

const OUTPUT_PATH = path.join(__dirname, 'public', 'links.json');
const curatedLinks = [];

/** Validates if a link is live (200 OK) using a quick HEAD request. */
async function validateLink(url) {
  try {
    const response = await axios.head(url, { maxRedirects: 5, timeout: 5000 });
    return response.status >= 200 && response.status < 400; // Success codes
  } catch (error) {
    return false; // Catches 404, 500, timeouts, etc.
  }
}

/** Scrapes a single website based on its configuration. */
async function scrapeWebsite(source) {
  if (source.isManual) {
    curatedLinks.push({ date: source.date, link: source.url, source: source.name, title: source.title });
    return;
  }
  
  try {
    const { data } = await axios.get(source.url);
    const $ = cheerio.load(data);
    
    // Iterate over article containers
    $(source.articleSelector).slice(0, 5).each((i, el) => {
      const linkEl = $(el).find(source.linkSelector).first();
      let link = linkEl.attr('href');
      let title = linkEl.text().trim().replace(/\s\s+/g, ' '); 
      const dateText = $(el).find(source.dateSelector).text().trim() || new Date().toISOString().split('T')[0];

      // Handle relative URLs
      if (link && link.startsWith('/')) {
        const urlObj = new URL(source.url);
        link = `${urlObj.origin}${link}`;
      }

      if (link && title) {
        curatedLinks.push({ date: dateText, link, source: source.name, title });
      }
    });

  } catch (error) {
    console.error(`Error scraping ${source.name}: ${error.message}`);
  }
}

// --- Main Execution ---
async function main() {
  console.log('Starting web scraping and validation...');
  
  // 1. Scrape all sources concurrently
  await Promise.all(SOURCES.map(scrapeWebsite));

  // 2. Filter for unique and valid links
  const uniqueLinks = Array.from(new Set(curatedLinks.map(l => l.link)))
    .map(link => curatedLinks.find(l => l.link === link));

  const validLinks = [];
  for (const item of uniqueLinks) {
    // Only validate external links; manual/placeholder links are assumed valid for this setup
    if (item.isManual || await validateLink(item.link)) {
      validLinks.push(item);
    } else {
      console.log(`--- Invalid link discarded: ${item.link}`);
    }
  }

  // 3. Sort (Newest first)
  validLinks.sort((a, b) => new Date(b.date) - new Date(a.date));

  // 4. Write to JSON file
  try {
    await fs.writeFile(OUTPUT_PATH, JSON.stringify(validLinks, null, 2));
    console.log(`Successfully wrote ${validLinks.length} valid links to ${OUTPUT_PATH}`);
  } catch (err) {
    console.error(`Error writing file: ${err.message}`);
    // If the 'public' directory doesn't exist on the runner, this will fail.
  }
}

main();

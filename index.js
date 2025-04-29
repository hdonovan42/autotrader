const axios = require('axios');
const cheerio = require('cheerio');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

// Configuration
const CONFIG = {
  // Search criteria
  criteria: {
    make: 'Volkswagen',
    model: 'Golf',
    variant: 'GTI Performance',
    minYear: 2017,
    gearbox: 'Manual',
    color: 'Black',
    doors: 5
  },
  
  // Autotrader search URL (will be constructed based on criteria)
  searchUrl: '',
  
  // How often to check (in milliseconds) - 60000 = 1 minute
  checkInterval: 60000,
  
  // Email configuration
  email: {
    from: 'your-email@gmail.com', // Replace with your email
    to: 'your-email@gmail.com',   // Replace with recipient email
    subject: 'New VW Golf GTI Performance listing on Autotrader!',
    smtpConfig: {
      service: 'gmail',
      auth: {
        user: 'your-email@gmail.com',     // Replace with your email
        pass: 'your-app-password'         // Replace with app password
      }
    }
  },
  
  // Storage file for seen listings
  storageFile: path.join(__dirname, 'seen-listings.json'),
  
  // Log file
  logFile: path.join(__dirname, 'autotrader-bot.log')
};

// Construct search URL based on criteria
function buildSearchUrl() {
  // This is a simplified URL construction - actual implementation would need to match 
  // Autotrader's URL structure which might change
  return `https://www.autotrader.co.uk/car-search?` +
    `make=${encodeURIComponent(CONFIG.criteria.make)}` +
    `&model=${encodeURIComponent(CONFIG.criteria.model)}` +
    `&year-from=${CONFIG.criteria.minYear}` +
    `&transmission=${encodeURIComponent(CONFIG.criteria.gearbox)}` +
    `&colour=${encodeURIComponent(CONFIG.criteria.color)}` +
    `&doors=${CONFIG.criteria.doors}`;
}

// Initialize seen listings storage
function initStorage() {
  if (!fs.existsSync(CONFIG.storageFile)) {
    fs.writeFileSync(CONFIG.storageFile, JSON.stringify({ listings: {} }));
    log('Storage file initialized');
  }
}

// Get previously seen listings
function getSeenListings() {
  try {
    const data = fs.readFileSync(CONFIG.storageFile, 'utf8');
    return JSON.parse(data).listings || {};
  } catch (error) {
    log(`Error loading seen listings: ${error.message}`);
    return {};
  }
}

// Save seen listings
function saveSeenListings(listings) {
  try {
    fs.writeFileSync(CONFIG.storageFile, JSON.stringify({ listings }, null, 2));
  } catch (error) {
    log(`Error saving seen listings: ${error.message}`);
  }
}

// Logging function
function log(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}`;
  console.log(logMessage);
  
  try {
    fs.appendFileSync(CONFIG.logFile, logMessage + '\n');
  } catch (error) {
    console.error(`Failed to write to log file: ${error.message}`);
  }
}

// Send email notification
async function sendEmail(newListings) {
  const transporter = nodemailer.createTransport(CONFIG.email.smtpConfig);
  
  // Prepare email body with all new listings
  let emailBody = `<h2>New VW Golf GTI Performance Listings</h2>`;
  
  newListings.forEach(listing => {
    emailBody += `
      <div style="margin-bottom: 20px; border-bottom: 1px solid #eee; padding-bottom: 10px;">
        <h3>${listing.title}</h3>
        <p><strong>Price:</strong> ${listing.price}</p>
        <p><strong>Year:</strong> ${listing.year}</p>
        <p><strong>Mileage:</strong> ${listing.mileage}</p>
        <p><strong>Location:</strong> ${listing.location}</p>
        <p><a href="${listing.url}" target="_blank">View on Autotrader</a></p>
      </div>
    `;
  });
  
  const mailOptions = {
    from: CONFIG.email.from,
    to: CONFIG.email.to,
    subject: `${CONFIG.email.subject} (${newListings.length} new listings)`,
    html: emailBody
  };
  
  try {
    const info = await transporter.sendMail(mailOptions);
    log(`Email sent: ${info.messageId}`);
    return true;
  } catch (error) {
    log(`Error sending email: ${error.message}`);
    return false;
  }
}

// Scrape Autotrader listings
async function scrapeListings() {
  try {
    log(`Checking Autotrader for new listings...`);
    
    const response = await axios.get(CONFIG.searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    
    const $ = cheerio.load(response.data);
    const listings = [];
    
    // Note: This selector needs to be updated based on Autotrader's current HTML structure
    // This is just an example based on previous structure
    $('.search-page__results .search-listing').each((index, element) => {
      try {
        const $element = $(element);
        
        // Extract listing details - selectors will need to be updated based on actual HTML structure
        const title = $element.find('.listing-title').text().trim();
        const url = 'https://www.autotrader.co.uk' + $element.find('a.listing-link').attr('href');
        const listingId = $element.attr('id') || url.split('/').pop();
        const price = $element.find('.listing-price').text().trim();
        const year = $element.find('.listing-key-specs li:first-child').text().trim();
        const mileage = $element.find('.listing-key-specs li:nth-child(2)').text().trim();
        const location = $element.find('.listing-location').text().trim();
        
        // Verify it's a GTI Performance model (the variant is often part of the title)
        if (title.toLowerCase().includes('gti performance')) {
          listings.push({
            id: listingId,
            title,
            url,
            price,
            year,
            mileage,
            location,
            firstSeen: new Date().toISOString()
          });
        }
      } catch (err) {
        log(`Error parsing listing: ${err.message}`);
      }
    });
    
    log(`Found ${listings.length} matching listings`);
    return listings;
  } catch (error) {
    log(`Error scraping Autotrader: ${error.message}`);
    return [];
  }
}

// Check for new listings and notify
async function checkNewListings() {
  try {
    // Load previously seen listings
    const seenListings = getSeenListings();
    
    // Scrape current listings
    const currentListings = await scrapeListings();
    
    // Identify new listings
    const newListings = currentListings.filter(listing => !seenListings[listing.id]);
    
    if (newListings.length > 0) {
      log(`Found ${newListings.length} new listings!`);
      
      // Send email notification
      await sendEmail(newListings);
      
      // Add new listings to seen listings
      newListings.forEach(listing => {
        seenListings[listing.id] = listing;
      });
      
      // Save updated seen listings
      saveSeenListings(seenListings);
    } else {
      log('No new listings found');
    }
  } catch (error) {
    log(`Error in checkNewListings: ${error.message}`);
  }
}

// Main function to start the monitoring
async function startMonitoring() {
  // Set up the search URL
  CONFIG.searchUrl = buildSearchUrl();
  log(`Search URL: ${CONFIG.searchUrl}`);
  
  // Initialize storage
  initStorage();
  
  // Perform initial check
  await checkNewListings();
  
  // Set up interval for regular checks
  setInterval(checkNewListings, CONFIG.checkInterval);
  log(`Monitoring started - checking every ${CONFIG.checkInterval / 1000} seconds`);
}

// Start the bot
startMonitoring().catch(error => {
  log(`Fatal error: ${error.message}`);
});
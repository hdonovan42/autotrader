const axios = require('axios');
const cheerio = require('cheerio');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

// Configuration
const CONFIG = {
  // Autotrader search URL - direct link with all criteria included
  searchUrl: 'https://www.autotrader.co.uk/car-search?advertising-location=at_cars&aggregatedTrim=GTI%20Performance&colour=Black&homeDeliveryAdverts=include&make=Volkswagen&maximum-mileage=60000&model=Golf&moreOptions=visible&postcode=ha7%202sa&quantity-of-https://www.autotrader.co.uk/car-search?advertising-location=at_cars&aggregatedTrim=GTI%20Performance&colour=Black&homeDeliveryAdverts=include&make=Volkswagen&maximum-mileage=60000&model=Golf&moreOptions=visible&postcode=ha7%202sa&quantity-of-doors=5&sort=relevance&transmission=Manual&year-from=2017',
  
  // How often to check (in milliseconds) - 60000 = 1 minute
  checkInterval: 60000,
  
  // Email configuration
  email: {
    from: 'donovanh59@gmail.com', // Replace with your email
    to: 'donovanh59@gmail.com',   
    subject: 'New VW Golf GTI Performance listing on Autotrader!',
    smtpConfig: {
      service: 'gmail',
      auth: {
        user: 'donovanh59@gmail.com',     
        pass: 'shar rspm ewxw golu'         
      }
    }
  },
  
  // Storage file for seen listings
  storageFile: path.join(__dirname, 'seen-listings.json'),
  
  // Log file
  logFile: path.join(__dirname, 'autotrader-bot.log')
};

// No longer needed as we're using a direct URL provided by the user
// function buildSearchUrl() {
//   // Function removed as we're using direct URL
// }

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
  
  // Get current date and time for the email
  const now = new Date();
  const formattedDate = now.toLocaleDateString('en-GB', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });
  const formattedTime = now.toLocaleTimeString('en-GB');
  
  // Prepare email body with all new listings
  let emailBody = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background-color: #213d7a; color: white; padding: 15px; text-align: center;">
        <h1 style="margin: 0;">New VW Golf GTI Performance Listings</h1>
        <p style="margin: 10px 0 0 0;">Found ${newListings.length} new listing(s) on ${formattedDate} at ${formattedTime}</p>
      </div>
      
      <div style="padding: 20px; background-color: #f5f5f5;">
  `;
  
  // Add listings to email body
  newListings.forEach((listing, index) => {
    // Format price if it exists
    const priceDisplay = listing.price ? listing.price : 'Price not specified';
    
    // Create view button
    const viewButtonStyle = "background-color: #213d7a; color: white; padding: 10px 15px; " +
                           "text-decoration: none; display: inline-block; border-radius: 4px; " +
                           "font-weight: bold; margin-top: 10px;";
    
    emailBody += `
      <div style="margin-bottom: 30px; background-color: white; padding: 20px; border-radius: 5px; box-shadow: 0 2px 5px rgba(0,0,0,0.1);">
        <h2 style="color: #213d7a; margin-top: 0; margin-bottom: 15px; border-bottom: 1px solid #eee; padding-bottom: 10px;">
          ${listing.title || 'Volkswagen Golf GTI Performance'}
        </h2>
        
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
          <p><strong>Price:</strong> ${priceDisplay}</p>
          <p><strong>Year:</strong> ${listing.year || 'Not specified'}</p>
          <p><strong>Mileage:</strong> ${listing.mileage || 'Not specified'}</p>
          <p><strong>Location:</strong> ${listing.location || 'Not specified'}</p>
        </div>
        
        <div style="text-align: center; margin-top: 20px;">
          <a href="${listing.url}" target="_blank" style="${viewButtonStyle}">View on Autotrader</a>
        </div>
      </div>
    `;
  });
  
  // Add footer with link back to search
  emailBody += `
      </div>
      <div style="background-color: #f0f0f0; padding: 15px; text-align: center; font-size: 12px; color: #666;">
        <p>This is an automated notification from your Autotrader monitoring bot.</p>
        <p><a href="${CONFIG.searchUrl}" style="color: #213d7a;">View all current listings on Autotrader</a></p>
      </div>
    </div>
  `;
  
  const mailOptions = {
    from: CONFIG.email.from,
    to: CONFIG.email.to,
    subject: `🚗 ${CONFIG.email.subject} (${newListings.length} new listing${newListings.length === 1 ? '' : 's'})`,
    html: emailBody
  };
  
  try {
    const info = await transporter.sendMail(mailOptions);
    log(`Email sent successfully: ${info.messageId}`);
    return true;
  } catch (error) {
    log(`Error sending email: ${error.message}`);
    if (error.stack) {
      log(`Stack trace: ${error.stack}`);
    }
    return false;
  }
}

// Scrape Autotrader listings
async function scrapeListings() {
  try {
    log(`Checking Autotrader for new listings...`);
    
    const response = await axios.get(CONFIG.searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Pragma': 'no-cache',
        'Upgrade-Insecure-Requests': '1',
        'Referer': 'https://www.autotrader.co.uk/'
      },
      timeout: 30000 // 30 second timeout
    });
    
    // Save the raw HTML to a file for debugging (only the first time)
    const debugFile = path.join(__dirname, 'autotrader-debug.html');
    if (!fs.existsSync(debugFile)) {
      fs.writeFileSync(debugFile, response.data);
      log(`Saved raw HTML to ${debugFile} for debugging`);
    }
    
    const $ = cheerio.load(response.data);
    const listings = [];
    
    // Log some basic page info to help with debugging
    log(`Page title: ${$('title').text()}`);
    
    // First, check if we're being blocked
    if (response.data.includes('captcha') || response.data.includes('cloudflare') || response.data.includes('security check')) {
      log('WARNING: Autotrader might be blocking automated requests. The page includes security checks.');
      return [];
    }
    
    // Updated selectors for Autotrader structure
    // Try multiple potential selector patterns to handle website variations
    const listingSelectors = [
      // Try various selectors based on different versions of Autotrader
      'li.search-page__result', 
      'article.product-card', 
      'div.search-result',
      'div[data-component="search-result"]',
      '.results-page-section article',
      '.search-listing',
      '.vehicle-card'
    ];
    
    // Try each selector pattern until we find matches
    let foundListings = false;
    
    for (const selector of listingSelectors) {
      const elements = $(selector);
      log(`Trying selector "${selector}": found ${elements.length} elements`);
      
      if (elements.length > 0) {
        foundListings = true;
        
        elements.each((index, element) => {
          try {
            const $element = $(element);
            let listingInfo = {};
            
            // Extract all text content for debugging
            const allText = $element.text().trim();
            
            // For titles - try various selectors
            const titleSelectors = [
              '.product-card-content__title', 'h2', 'h3', '.listing-title', 
              '.advert-heading', '.search-result__title', '.vehicle-card__title'
            ];
            
            let title = '';
            for (const sel of titleSelectors) {
              const t = $element.find(sel).text().trim();
              if (t) {
                title = t;
                break;
              }
            }
            
            // If still no title found, try to find any heading element
            if (!title) {
              title = $element.find('h1, h2, h3, h4, h5').first().text().trim();
            }
            
            // For URLs - try various selectors
            let url = '';
            const linkSelectors = [
              'a.tracking-standard-link', 'a.advert-link', 'a[href*="/car-details"]', 
              'a.listing-fpa-link', 'a[href*="volkswagen"]'
            ];
            
            for (const sel of linkSelectors) {
              const linkElement = $element.find(sel);
              if (linkElement.length > 0) {
                const href = linkElement.attr('href');
                if (href) {
                  url = href.startsWith('http') ? href : `https://www.autotrader.co.uk${href}`;
                  break;
                }
              }
            }
            
            // If still no URL, try any link in the element
            if (!url) {
              const href = $element.find('a').first().attr('href');
              if (href) {
                url = href.startsWith('http') ? href : `https://www.autotrader.co.uk${href}`;
              }
            }
            
            // Generate listing ID
            const listingId = url.split('/').pop() || `listing-${index}`;
            
            // Extract all possible data
            const allData = {
              title: title,
              url: url,
              id: listingId,
              price: '',
              year: '',
              mileage: '',
              location: '',
              allText: allText, // Include all text for debugging
              firstSeen: new Date().toISOString()
            };
            
            // Try to extract price
            const priceSelectors = [
              '.product-card-pricing__price', '.advert-price', '.vehicle-price',
              '.vehicle-card__price', '.search-listing__price', 'span[data-price]'
            ];
            
            for (const sel of priceSelectors) {
              const price = $element.find(sel).text().trim();
              if (price) {
                allData.price = price;
                break;
              }
            }
            
            // Try to extract year
            let yearFound = false;
            $element.find('*').each((i, el) => {
              if (yearFound) return;
              const text = $(el).text().trim();
              // Look for a pattern like "2017" or "2017 (67)"
              const yearMatch = text.match(/\b(20\d{2})\b/);
              if (yearMatch) {
                allData.year = yearMatch[1];
                yearFound = true;
              }
            });
            
            // Try to extract mileage
            let mileageFound = false;
            $element.find('*').each((i, el) => {
              if (mileageFound) return;
              const text = $(el).text().trim();
              // Look for patterns like "30,000 miles" or "30k miles"
              const mileageMatch = text.match(/(\d[\d,.]*k?)\s*miles/i);
              if (mileageMatch) {
                allData.mileage = mileageMatch[0];
                mileageFound = true;
              }
            });
            
            // Try to extract location
            const locationSelectors = [
              '.product-card-seller-location', '.seller-location', '.listing-location',
              '.vehicle-location'
            ];
            
            for (const sel of locationSelectors) {
              const location = $element.find(sel).text().trim();
              if (location) {
                allData.location = location;
                break;
              }
            }
            
            // Check if it's a GTI Performance model
            const fullText = allText.toLowerCase();
            const isGTIPerformance = 
              fullText.includes('gti performance') || 
              (fullText.includes('gti') && fullText.includes('performance')) ||
              title.toLowerCase().includes('gti performance');
            
            // Add the listing if it appears to be a GTI Performance
            // Since the URL filter already includes our criteria, we can be more lenient here
            if (isGTIPerformance || title.toLowerCase().includes('gti')) {
              listings.push(allData);
              log(`Found potential GTI listing: ${title}`);
            }
          } catch (err) {
            log(`Error parsing listing: ${err.message}`);
          }
        });
      }
    }
    
    if (!foundListings) {
      log('WARNING: Could not find any listings with the tried selectors.');
      log('You may need to update the selectors or check the saved debug HTML file.');
    }
    
    log(`Found ${listings.length} potential GTI Performance listings`);
    return listings;
  } catch (error) {
    log(`Error scraping Autotrader: ${error.message}`);
    if (error.response) {
      log(`Status code: ${error.response.status}`);
      log(`Headers: ${JSON.stringify(error.response.headers)}`);
    }
    return [];
  }
}

// Check for new listings and notify
async function checkNewListings() {
  try {
    log('Starting check for new listings...');
    
    // Load previously seen listings
    const seenListings = getSeenListings();
    
    // Scrape current listings
    const currentListings = await scrapeListings();
    
    if (currentListings.length === 0) {
      log('No listings found in this check. This could be due to:');
      log('1. No matching listings currently on Autotrader');
      log('2. Website structure changed (check debug HTML file)');
      log('3. Possible rate limiting or blocking (try less frequent checks)');
      return;
    }
    
    // Log how many listings we found total
    log(`Found ${currentListings.length} total listings that may match criteria`);
    
    // Use URL as backup identifier if ID is missing
    currentListings.forEach(listing => {
      if (!listing.id && listing.url) {
        listing.id = listing.url.split('/').pop();
      }
    });
    
    // Identify new listings - consider a listing as "seen" if we have its ID or URL
    const newListings = currentListings.filter(listing => {
      // Check if we've seen this exact ID
      if (seenListings[listing.id]) return false;
      
      // Check if we've seen this URL before (as a backup)
      const url = listing.url;
      const seenByUrl = Object.values(seenListings).some(seenListing => 
        seenListing.url === url
      );
      
      return !seenByUrl;
    });
    
    if (newListings.length > 0) {
      log(`Found ${newListings.length} NEW listings!`);
      
      // Detailed log of new listings
      newListings.forEach((listing, index) => {
        log(`New listing #${index + 1}: ${listing.title} - ${listing.price}`);
      });
      
      // Send email notification
      await sendEmail(newListings);
      
      // Add new listings to seen listings
      newListings.forEach(listing => {
        seenListings[listing.id] = {
          ...listing,
          notifiedAt: new Date().toISOString()
        };
      });
      
      // Save updated seen listings
      saveSeenListings(seenListings);
      
      log('New listings saved and notification sent');
    } else {
      log('No new listings found');
    }
    
    // Log total number of seen listings for reference
    log(`Total seen listings in database: ${Object.keys(seenListings).length}`);
    
  } catch (error) {
    log(`Error in checkNewListings: ${error.message}`);
    if (error.stack) {
      log(`Stack trace: ${error.stack}`);
    }
  }
}

// Main function to start the monitoring
async function startMonitoring() {
  // No need to build URL - using the provided hyperlink directly
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
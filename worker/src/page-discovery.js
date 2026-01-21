const { GoogleGenerativeAI } = require('@google/generative-ai');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const genAI = GEMINI_API_KEY ? new GoogleGenerativeAI(GEMINI_API_KEY) : null;

const DISCOVERY_SYSTEM_PROMPT = `You are an expert at analyzing websites and identifying key pages for screenshot monitoring.

Your task is to analyze the navigation and content of a website and recommend the most important pages to monitor.

You will receive:
1. The main navigation links
2. Additional links found on the page
3. Page content structure

Guidelines for selecting pages:
- ALWAYS include the homepage
- Include all main navigation items (top-level menu links)
- For content-heavy sites, include ONE representative detail page per content type (e.g., one article, one product, one blog post)
- Prefer pages that showcase different layouts/templates
- Exclude: login/logout pages, search result pages, utility pages (sitemap, privacy policy, terms), external links
- Exclude: pagination links, anchor links (#), javascript: links
- Keep URLs within the same domain

Return the result using the submitPageList function.`;

/**
 * Page Discovery Service - Uses AI to discover important pages on a website
 */
class PageDiscovery {
  constructor(browserPool) {
    this.browserPool = browserPool;
  }

  /**
   * Discover pages on a website
   * @param {string} domain - Domain to discover pages on
   * @param {object} options - Discovery options
   * @param {number} options.maxPages - Maximum number of pages to return (default: 10)
   * @returns {Promise<object>} Discovery result with pages array
   */
  async discover(domain, options = {}) {
    const { maxPages = 10 } = options;
    
    if (!genAI) {
      return { success: false, error: 'Gemini API key not configured' };
    }

    // Normalize domain to URL
    let baseUrl = domain;
    if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
      baseUrl = `https://${domain}`;
    }

    let browser = null;
    let page = null;

    try {
      console.log(`PageDiscovery: Starting discovery for ${baseUrl}`);
      
      browser = await this.browserPool.acquire();
      page = await browser.newPage();
      
      // Set viewport and user agent
      await page.setViewport({ width: 1920, height: 1080 });
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      
      // Navigate to the homepage
      console.log(`PageDiscovery: Navigating to ${baseUrl}`);
      await page.goto(baseUrl, { waitUntil: 'networkidle2', timeout: 30000 });
      
      // Wait for content to load
      await new Promise(r => setTimeout(r, 2000));
      
      // Extract page data
      const pageData = await this.extractPageData(page, baseUrl);
      console.log(`PageDiscovery: Found ${pageData.navLinks.length} nav links, ${pageData.contentLinks.length} content links`);
      
      // Use Gemini to analyze and select pages
      const result = await this.analyzeWithGemini(pageData, baseUrl, maxPages);
      
      return result;

    } catch (error) {
      console.error('PageDiscovery: Error:', error);
      return { 
        success: false, 
        error: error.message 
      };
    } finally {
      if (page) {
        try { await page.close(); } catch (e) {}
      }
      if (browser) {
        this.browserPool.release(browser);
      }
    }
  }

  /**
   * Extract links and page structure from the page
   */
  async extractPageData(page, baseUrl) {
    const baseUrlObj = new URL(baseUrl);
    const baseDomain = baseUrlObj.hostname;

    return await page.evaluate((baseDomain, baseUrl) => {
      const result = {
        title: document.title,
        navLinks: [],
        contentLinks: [],
        pageStructure: []
      };

      // Helper to normalize URLs
      const normalizeUrl = (href) => {
        if (!href) return null;
        if (href.startsWith('javascript:') || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) {
          return null;
        }
        try {
          const url = new URL(href, baseUrl);
          // Only include same-domain links
          if (url.hostname !== baseDomain && !url.hostname.endsWith('.' + baseDomain)) {
            return null;
          }
          // Clean up the URL
          url.hash = '';
          return url.href;
        } catch {
          return null;
        }
      };

      // Find navigation elements
      const navSelectors = [
        'nav a',
        'header a',
        '[role="navigation"] a',
        '.nav a',
        '.navbar a',
        '.menu a',
        '.main-menu a',
        '.main-nav a',
        '#nav a',
        '#menu a',
        '#navigation a'
      ];

      const navLinksSet = new Set();
      for (const selector of navSelectors) {
        const links = document.querySelectorAll(selector);
        for (const link of links) {
          const href = normalizeUrl(link.href);
          if (href && !navLinksSet.has(href)) {
            navLinksSet.add(href);
            result.navLinks.push({
              url: href,
              text: (link.textContent || '').trim().slice(0, 100),
              isInHeader: !!link.closest('header'),
              isInNav: !!link.closest('nav')
            });
          }
        }
      }

      // Find content links (articles, products, posts)
      const contentSelectors = [
        'article a',
        '.article a',
        '.post a',
        '.product a',
        '.card a',
        '.item a',
        '.entry a',
        'main a',
        '#content a',
        '.content a'
      ];

      const contentLinksSet = new Set();
      for (const selector of contentSelectors) {
        const links = document.querySelectorAll(selector);
        for (const link of links) {
          const href = normalizeUrl(link.href);
          if (href && !contentLinksSet.has(href) && !navLinksSet.has(href)) {
            contentLinksSet.add(href);
            
            // Try to determine content type from URL patterns
            let contentType = 'page';
            const urlLower = href.toLowerCase();
            if (urlLower.includes('/article') || urlLower.includes('/news') || urlLower.includes('/post') || urlLower.includes('/blog')) {
              contentType = 'article';
            } else if (urlLower.includes('/product') || urlLower.includes('/shop') || urlLower.includes('/item')) {
              contentType = 'product';
            } else if (urlLower.includes('/category') || urlLower.includes('/tag') || urlLower.includes('/topic')) {
              contentType = 'category';
            }

            result.contentLinks.push({
              url: href,
              text: (link.textContent || '').trim().slice(0, 100),
              contentType,
              parentTag: link.closest('article, .article, .post, .product, .card')?.tagName || null
            });

            // Limit content links
            if (result.contentLinks.length >= 50) break;
          }
        }
        if (result.contentLinks.length >= 50) break;
      }

      // Get basic page structure
      const sections = document.querySelectorAll('main, article, section, .section, [role="main"]');
      for (const section of Array.from(sections).slice(0, 10)) {
        const heading = section.querySelector('h1, h2, h3');
        result.pageStructure.push({
          tag: section.tagName.toLowerCase(),
          id: section.id || null,
          className: section.className?.split(' ')[0] || null,
          heading: heading?.textContent?.trim().slice(0, 100) || null
        });
      }

      return result;
    }, baseDomain, baseUrl);
  }

  /**
   * Use Gemini to analyze page data and select pages
   */
  async analyzeWithGemini(pageData, baseUrl, maxPages) {
    const tools = [{
      functionDeclarations: [{
        name: 'submitPageList',
        description: 'Submit the final list of pages to monitor. Call this once with your curated list.',
        parameters: {
          type: 'object',
          properties: {
            pages: {
              type: 'array',
              description: 'Array of pages to monitor',
              items: {
                type: 'object',
                properties: {
                  url: {
                    type: 'string',
                    description: 'Full URL of the page'
                  },
                  title: {
                    type: 'string',
                    description: 'Suggested title/name for the page (e.g., "Homepage", "Products", "About Us")'
                  },
                  reason: {
                    type: 'string',
                    description: 'Brief reason why this page should be monitored'
                  }
                },
                required: ['url', 'title', 'reason']
              }
            }
          },
          required: ['pages']
        }
      }]
    }];

    const model = genAI.getGenerativeModel({
      model: 'gemini-3-pro-preview',
      tools,
      systemInstruction: DISCOVERY_SYSTEM_PROMPT
    });

    const prompt = `Analyze this website and select up to ${maxPages} pages to monitor.

Website: ${baseUrl}
Page Title: ${pageData.title}

NAVIGATION LINKS (${pageData.navLinks.length} found):
${pageData.navLinks.slice(0, 30).map(l => `- ${l.text || 'No text'}: ${l.url}`).join('\n')}

CONTENT LINKS (${pageData.contentLinks.length} found, showing sample):
${pageData.contentLinks.slice(0, 20).map(l => `- [${l.contentType}] ${l.text || 'No text'}: ${l.url}`).join('\n')}

PAGE STRUCTURE:
${pageData.pageStructure.map(s => `- <${s.tag}${s.id ? ` id="${s.id}"` : ''}> ${s.heading || ''}`).join('\n')}

Please analyze and select the ${maxPages} most important pages for screenshot monitoring. Always include the homepage. For content pages (articles, products), include only ONE representative example of each type to show different page templates.

Call submitPageList with your selection.`;

    try {
      console.log('PageDiscovery: Calling Gemini for analysis');
      const result = await model.generateContent(prompt);
      const response = result.response;
      const candidate = response.candidates[0];
      
      // Look for function call
      for (const part of candidate.content.parts) {
        if (part.functionCall && part.functionCall.name === 'submitPageList') {
          const pages = part.functionCall.args.pages || [];
          console.log(`PageDiscovery: Gemini selected ${pages.length} pages`);
          
          // Ensure homepage is included
          const hasHomepage = pages.some(p => {
            const url = new URL(p.url);
            return url.pathname === '/' || url.pathname === '';
          });
          
          if (!hasHomepage) {
            pages.unshift({
              url: baseUrl,
              title: 'Homepage',
              reason: 'Main entry point of the website'
            });
          }

          return {
            success: true,
            pages: pages.slice(0, maxPages),
            totalFound: pageData.navLinks.length + pageData.contentLinks.length
          };
        }
      }

      // No function call found
      const text = candidate.content.parts.find(p => p.text)?.text || '';
      return {
        success: false,
        error: 'AI did not return a page list: ' + text.slice(0, 200)
      };

    } catch (error) {
      console.error('PageDiscovery: Gemini error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = PageDiscovery;

import puppeteer from "puppeteer";
import { writeFileSync } from "fs";

const TIMESTAMP = getCurrentTimestamp();
const URL =
  "https://imgur.com/gallery/john-campbells-pictures-sad-children-ihNnt";
const RECORDING_PATH = `recording-${TIMESTAMP}.webm`;
const URLS_PATH = `urls-${TIMESTAMP}.json`;

// returns timestamp in form YYYY-MM-DD-hh-mm-ss
function getCurrentTimestamp() {
  const now = new Date();
  const pad = (n) => n.toString().padStart(2, "0");
  return (
    now.getFullYear() +
    "-" +
    pad(now.getMonth() + 1) +
    "-" +
    pad(now.getDate()) +
    "-" +
    pad(now.getHours()) +
    "-" +
    pad(now.getMinutes()) +
    "-" +
    pad(now.getSeconds())
  );
}

async function scrapeInfiniteScrollImages(url) {
  const browser = await puppeteer.launch({
    headless: false, // Set to false for debugging visibility
    defaultViewport: { width: 1200, height: 800 },
  });
  const page = await browser.newPage();

  // Navigate to the page
  await page.goto(url, { waitUntil: "networkidle0" });

  // Initialize array to store image URLs in order
  const imageUrls = [];

  // Clear some initial hurdles
  await page.waitForSelector("::-p-text(Continue without supporting us)");
  const continueWithoutSupportingUs = page.locator(
    "::-p-text(Continue without supporting us)"
  );
  await continueWithoutSupportingUs.click();

  await page.waitForSelector(".loadMore");
  const button = page.locator(".loadMore");
  await button.click();
  console.log("Clicked loadMore button");

  await page.evaluate(() => document.scrollingElement.scrollTo(0, 0));

  // Start recording
  const recorder = await page.screencast({ path: RECORDING_PATH });
  const recordStart = Date.now();

  // Function to scroll and collect images
  async function scrollAndCollect() {
    // console.log(
    //   await page.evaluate(
    //     () =>
    //       document.scrollingElement.scrollTop /
    //       document.scrollingElement.scrollHeight
    //   )
    // );

    return await page.evaluate(async () => {
      const SCROLL_DISTANCE_PER_ITERATION = 100;

      const gallery = document.querySelector(".Gallery-ContentWrapper");
      const scroller = document.scrollingElement;
      if (!gallery) throw new Error("Gallery element not found");
      if (!scroller) throw new Error("Scroller element not found");

      scroller.scrollBy(0, SCROLL_DISTANCE_PER_ITERATION);

      // Collect all current image sources, maintaining DOM order
      const images = gallery.getElementsByTagName("img");
      const sources = Array.from(images).map((img) => img.src);

      return {
        sources,
      };
    });
  }

  let reachedBottom = false;
  let lastImage = Date.now();

  while (!reachedBottom) {
    const { sources } = await scrollAndCollect();

    // Add new sources to our array, preserving order
    sources.forEach((src) => {
      if (imageUrls.some((image) => image.src === src)) return;
      console.log("Found new image:", src);
      imageUrls.push({ src, timestamp: Date.now() - recordStart });

      lastImage = Date.now();
    });

    if (Date.now() - lastImage > 2000) {
      console.log("Stopped scrolling - no new content detected");
      reachedBottom = true;
    }

    await new Promise((resolve) => setTimeout(resolve, 20));
  }

  console.log("Stopping recording");
  await recorder.stop();
  console.log("Stopped recording");

  console.log("Closing browser");
  await browser.close();
  console.log("Closed browser");

  return imageUrls;
}

// Example usage
async function main() {
  try {
    const urls = await scrapeInfiniteScrollImages(URL);
    console.log(`Found ${urls.length} images`);
    writeFileSync(URLS_PATH, JSON.stringify(urls, null, 2));
  } catch (error) {
    console.error("Error during scraping:", error);
  }
}

main();

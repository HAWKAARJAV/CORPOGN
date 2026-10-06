import { chromium } from "@playwright/test";

async function main() {
  console.log("Launching headless browser to check Income Tax exempted institutions page...");
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  try {
    await page.goto("https://www.incometaxindia.gov.in/Pages/utilities/exempted-institutions.aspx");
    console.log("Navigated. Waiting 8 seconds for dynamic widgets and Liferay elements to render...");
    await page.waitForTimeout(8000);

    const hasCaptcha = await page.evaluate(() => {
      const htmlText = document.body.innerText.toLowerCase();
      const htmlSrc = document.body.innerHTML.toLowerCase();
      
      const containsCaptchaText = htmlText.includes("captcha") || htmlText.includes("enter verification code") || htmlText.includes("enter code");
      const containsCaptchaTag = !!document.querySelector("img[src*='captcha'], input[id*='captcha'], input[name*='captcha']");
      const containsIframe = !!document.querySelector("iframe");
      
      return {
        containsCaptchaText,
        containsCaptchaTag,
        containsIframe,
        inputCount: document.querySelectorAll("input").length,
        selectCount: document.querySelectorAll("select").length,
        buttonCount: document.querySelectorAll("button").length,
        visibleTextSnippet: htmlText.substring(0, 1000).replace(/\s+/g, " ")
      };
    });

    console.log("\n--- Page Structure Analysis ---");
    console.log("Has Captcha text in DOM:", hasCaptcha.containsCaptchaText);
    console.log("Has Captcha img/input tag:", hasCaptcha.containsCaptchaTag);
    console.log("Has iframe:", hasCaptcha.containsIframe);
    console.log("Inputs found:", hasCaptcha.inputCount);
    console.log("Selects found:", hasCaptcha.selectCount);
    console.log("Buttons found:", hasCaptcha.buttonCount);
    console.log("Page Text Snippet:", hasCaptcha.visibleTextSnippet);

  } catch (err) {
    console.error("Execution failed:", err.message);
  } finally {
    await browser.close();
  }
}

main().catch(console.error);

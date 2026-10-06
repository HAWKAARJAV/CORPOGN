import { rateLimitedFetch } from "../lib/fetcher.mjs";

async function test() {
  const url = "https://give.do/discover/sos-childrens-villages-of-india";
  const res = await rateLimitedFetch(url);
  const text = await res.text();
  
  // Find __NEXT_DATA__ or any JSON state
  const nextData = text.match(/<script[^>]+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (nextData) {
    console.log("Found __NEXT_DATA__!");
    console.log("Length:", nextData[1].length);
    console.log(nextData[1].slice(0, 1000));
    return;
  }
  
  const stateData = text.match(/window\.__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\});/);
  if (stateData) {
    console.log("Found __INITIAL_STATE__!");
    console.log("Length:", stateData[1].length);
    console.log(stateData[1].slice(0, 1000));
    return;
  }

  const jsonScripts = [];
  const regex = /<script[^>]*type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = regex.exec(text)) !== null) {
    jsonScripts.push(match[1]);
  }
  console.log(`Found ${jsonScripts.length} application/json scripts.`);
  for (const js of jsonScripts) {
    console.log("JSON snippet:", js.slice(0, 300));
  }
}

test().catch(console.error);

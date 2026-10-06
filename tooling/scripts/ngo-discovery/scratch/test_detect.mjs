import { safeFetch } from "../lib/fetcher.mjs";
import { detectPageCount } from "../lib/parsers/give-discover.mjs";

async function main() {
  const res = await safeFetch("https://give.do/discover/state/Delhi/");
  console.log("Response status:", res.status);
  console.log("Detected page count:", detectPageCount(res.text));
  const pageNums = [];
  const re1 = /[?&]page=(\d+)/gi;
  let m;
  while ((m = re1.exec(res.text)) !== null) {
    pageNums.push(parseInt(m[1], 10));
  }
  console.log("All matched page numbers:", pageNums);
}

main().catch(err => console.error(err));

import { getAuthenticatedScraper, exitProxyAgent } from "./auth";

function parseArgs(): { username: string; count: number } {
  const args = process.argv.slice(2);
  let username = "xdevelopers";
  let count = 5;

  for (let i = 0; i < args.length; i++) {
    if ((args[i] === "--username" || args[i] === "-u") && args[i + 1]) {
      username = args[++i].replace(/^@/, "");
    } else if ((args[i] === "--count" || args[i] === "-n") && args[i + 1]) {
      count = parseInt(args[++i], 10) || 5;
    } else if (!args[i].startsWith("-")) {
      username = args[i].replace(/^@/, "");
    }
  }

  return { username, count };
}

async function main(): Promise<void> {
  const { username, count } = parseArgs();
  console.log(`=== Twitter Notification Bot ===\n`);

  const scraper = await getAuthenticatedScraper();

  console.log(
    `\n[main] Fetching latest ${count} tweets from @${username}...\n`,
  );

  let fetched = 0;
  for await (const tweet of scraper.getTweets(username, count)) {
    fetched++;
    console.log("\u2500".repeat(60));
    console.log(JSON.stringify(tweet, null, 2));
  }

  console.log("\u2500".repeat(60));
  console.log(`\n[main] Fetched ${fetched} tweets from @${username}`);
}

main()
  .catch((err) => {
    console.error("[fatal]", err);
    process.exitCode = 1;
  })
  .finally(() => {
    exitProxyAgent();
  });

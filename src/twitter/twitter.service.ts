import { Injectable, Logger } from "@nestjs/common";
import { SearchMode } from "@the-convocation/twitter-scraper";
import { TwitterClientPoolService } from "./twitter-client-pool.service";
import { withTimeout } from "../common/timeout";
import { RequestPriority } from "../common/queue";

@Injectable()
export class TwitterService {
  private readonly logger = new Logger(TwitterService.name);

  constructor(private pool: TwitterClientPoolService) {}

  async getTweets(username: string, count: number) {
    return this.pool.execute(
      `getTweets(${username})`,
      async (scraper) => {
        const tweets: unknown[] = [];
        for await (const tweet of scraper.getTweets(username, count)) {
          tweets.push(this.sanitizeTweet(tweet));
          if (tweets.length >= count) break;
        }
        return tweets;
      },
      RequestPriority.MEDIUM,
    );
  }

  async getLatestTweet(username: string) {
    return this.pool.execute(
      `getLatestTweet(${username})`,
      async (scraper) => {
        const tweet = await withTimeout(
          scraper.getLatestTweet(username),
          this.pool.timeouts.tweet,
          "getLatestTweet",
        );
        return tweet ? this.sanitizeTweet(tweet) : null;
      },
    );
  }

  async getTweetsAndReplies(username: string, count: number) {
    return this.pool.execute(
      `getTweetsAndReplies(${username})`,
      async (scraper) => {
        const tweets: unknown[] = [];
        for await (const tweet of scraper.getTweetsAndReplies(
          username,
          count,
        )) {
          tweets.push(this.sanitizeTweet(tweet));
          if (tweets.length >= count) break;
        }
        return tweets;
      },
    );
  }

  async searchTweets(
    query: string,
    count: number,
    mode: "latest" | "top" = "latest",
  ) {
    const searchMode =
      mode === "top" ? SearchMode.Top : SearchMode.Latest;

    return this.pool.execute(
      `searchTweets("${query}")`,
      async (scraper) => {
        const response = await withTimeout(
          scraper.fetchSearchTweets(query, count, searchMode),
          this.pool.timeouts.search,
          "searchTweets",
        );
        return {
          tweets: (response?.tweets ?? []).map((t) =>
            this.sanitizeTweet(t),
          ),
          next: response?.next ?? null,
        };
      },
    );
  }

  async getProfile(username: string) {
    return this.pool.execute(
      `getProfile(${username})`,
      async (scraper) => {
        return withTimeout(
          scraper.getProfile(username),
          this.pool.timeouts.profile,
          "getProfile",
        );
      },
      RequestPriority.MEDIUM,
    );
  }

  async getTweetById(tweetId: string) {
    return this.pool.execute(
      `getTweet(${tweetId})`,
      async (scraper) => {
        const tweet = await withTimeout(
          scraper.getTweet(tweetId),
          this.pool.timeouts.tweet,
          "getTweet",
        );
        return tweet ? this.sanitizeTweet(tweet) : null;
      },
    );
  }

  async getFollowers(username: string, count: number) {
    return this.pool.execute(
      `getFollowers(${username})`,
      async (scraper) => {
        const userId = await withTimeout(
          scraper.getUserIdByScreenName(username),
          this.pool.timeouts.profile,
          "getUserId",
        );
        if (!userId) return { profiles: [], next: null };

        const result = await withTimeout(
          scraper.fetchProfileFollowers(userId, count),
          this.pool.timeouts.profile,
          "fetchFollowers",
        );
        return {
          profiles: result?.profiles ?? [],
          next: result?.next ?? null,
        };
      },
    );
  }

  async getFollowing(username: string, count: number) {
    return this.pool.execute(
      `getFollowing(${username})`,
      async (scraper) => {
        const userId = await withTimeout(
          scraper.getUserIdByScreenName(username),
          this.pool.timeouts.profile,
          "getUserId",
        );
        if (!userId) return { profiles: [], next: null };

        const result = await withTimeout(
          scraper.fetchProfileFollowing(userId, count),
          this.pool.timeouts.profile,
          "fetchFollowing",
        );
        return {
          profiles: result?.profiles ?? [],
          next: result?.next ?? null,
        };
      },
    );
  }

  private sanitizeTweet(tweet: unknown): unknown {
    return JSON.parse(
      JSON.stringify(tweet, (key, value) =>
        key === "inReplyToStatus" ? undefined : value,
      ),
    );
  }
}

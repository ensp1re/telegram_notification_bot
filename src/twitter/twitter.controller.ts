import {
  Controller,
  Get,
  Param,
  Query,
  HttpException,
  Logger,
} from "@nestjs/common";
import { TwitterService } from "./twitter.service";
import { TwitterClientPoolService } from "./twitter-client-pool.service";
import { classifyError, errorTypeToHttpStatus } from "../common/errors";

@Controller()
export class TwitterController {
  private readonly logger = new Logger(TwitterController.name);

  constructor(
    private twitter: TwitterService,
    private pool: TwitterClientPoolService,
  ) {}

  // -----------------------------------------------------------------------
  // Health / stats
  // -----------------------------------------------------------------------

  @Get("health")
  health() {
    return { status: "ok", timestamp: new Date().toISOString() };
  }

  @Get("stats")
  stats() {
    return this.pool.getStats();
  }

  // -----------------------------------------------------------------------
  // Tweets
  // -----------------------------------------------------------------------

  @Get("tweets/:username")
  async getTweets(
    @Param("username") username: string,
    @Query("count") countStr?: string,
  ) {
    const count = Math.min(Math.max(parseInt(countStr ?? "5", 10) || 5, 1), 100);
    return this.wrap(() => this.twitter.getTweets(username, count));
  }

  @Get("tweets/:username/latest")
  async getLatestTweet(@Param("username") username: string) {
    return this.wrap(() => this.twitter.getLatestTweet(username));
  }

  @Get("tweets/:username/replies")
  async getTweetsAndReplies(
    @Param("username") username: string,
    @Query("count") countStr?: string,
  ) {
    const count = Math.min(Math.max(parseInt(countStr ?? "5", 10) || 5, 1), 100);
    return this.wrap(() => this.twitter.getTweetsAndReplies(username, count));
  }

  // -----------------------------------------------------------------------
  // Search
  // -----------------------------------------------------------------------

  @Get("search")
  async search(
    @Query("q") query?: string,
    @Query("count") countStr?: string,
    @Query("mode") mode?: string,
  ) {
    if (!query) {
      throw new HttpException("Missing required query parameter: q", 400);
    }
    const count = Math.min(Math.max(parseInt(countStr ?? "20", 10) || 20, 1), 100);
    const searchMode = mode === "top" ? "top" : "latest";
    return this.wrap(() =>
      this.twitter.searchTweets(query, count, searchMode as "latest" | "top"),
    );
  }

  // -----------------------------------------------------------------------
  // Profile
  // -----------------------------------------------------------------------

  @Get("profile/:username")
  async getProfile(@Param("username") username: string) {
    return this.wrap(() => this.twitter.getProfile(username));
  }

  @Get("followers/:username")
  async getFollowers(
    @Param("username") username: string,
    @Query("count") countStr?: string,
  ) {
    const count = Math.min(Math.max(parseInt(countStr ?? "50", 10) || 50, 1), 200);
    return this.wrap(() => this.twitter.getFollowers(username, count));
  }

  @Get("following/:username")
  async getFollowing(
    @Param("username") username: string,
    @Query("count") countStr?: string,
  ) {
    const count = Math.min(Math.max(parseInt(countStr ?? "50", 10) || 50, 1), 200);
    return this.wrap(() => this.twitter.getFollowing(username, count));
  }

  // -----------------------------------------------------------------------
  // Single tweet
  // -----------------------------------------------------------------------

  @Get("tweet/:id")
  async getTweet(@Param("id") id: string) {
    return this.wrap(() => this.twitter.getTweetById(id));
  }

  // -----------------------------------------------------------------------
  // Error mapping helper
  // -----------------------------------------------------------------------

  private async wrap<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      const errorType = classifyError(error);
      const status = errorTypeToHttpStatus(errorType);
      this.logger.error(`${error.message.slice(0, 200)}`);
      throw new HttpException(
        { error: errorType, message: error.message.slice(0, 300) },
        status,
      );
    }
  }
}

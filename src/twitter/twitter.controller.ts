import {
  Controller,
  Get,
  Param,
  Query,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiQuery,
} from "@nestjs/swagger";
import { TwitterService } from "./twitter.service";
import { TwitterClientPoolService } from "./twitter-client-pool.service";
import { classifyError, errorTypeToHttpStatus } from "../common/errors";
import { ok, ApiResponseDto, ApiErrorDetail } from "../common/api-response";
import {
  TweetDto,
  SearchResultDto,
  ProfileDto,
  FollowListDto,
  PoolStatsDto,
  HealthDto,
  CountQueryDto,
  SearchQueryDto,
  FollowQueryDto,
} from "./dto";

// ---------------------------------------------------------------------------
// Helper: clamp numeric query param
// ---------------------------------------------------------------------------

function clampCount(raw: string | undefined, def: number, max: number): number {
  return Math.min(Math.max(parseInt(raw ?? String(def), 10) || def, 1), max);
}

// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------

@ApiTags("twitter")
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
  @ApiOperation({ summary: "API health check" })
  @ApiResponse({ status: 200, description: "API is running" })
  health(): ApiResponseDto<HealthDto> {
    return ok({ status: "ok", timestamp: new Date().toISOString() }, "API is healthy");
  }

  @Get("stats")
  @ApiOperation({ summary: "Pool statistics (accounts, proxies, concurrency)" })
  @ApiResponse({ status: 200, description: "Pool statistics" })
  stats(): ApiResponseDto<PoolStatsDto> {
    return ok(this.pool.getStats() as PoolStatsDto, "Pool statistics");
  }

  // -----------------------------------------------------------------------
  // Tweets
  // -----------------------------------------------------------------------

  @Get("tweets/:username")
  @ApiOperation({ summary: "Get recent tweets for a user" })
  @ApiParam({ name: "username", example: "ensp1re" })
  @ApiQuery({ name: "count", required: false, example: "5", description: "1-100" })
  @ApiResponse({ status: 200, description: "Tweets fetched" })
  async getTweets(
    @Param("username") username: string,
    @Query() query: CountQueryDto,
  ): Promise<ApiResponseDto<TweetDto[]>> {
    const count = clampCount(query.count, 5, 100);
    const data = await this.wrap(() => this.twitter.getTweets(username, count));
    return ok(data as TweetDto[], `Fetched ${(data as TweetDto[]).length} tweets for @${username}`);
  }

  @Get("tweets/:username/latest")
  @ApiOperation({ summary: "Get latest single tweet for a user" })
  @ApiParam({ name: "username", example: "ensp1re" })
  @ApiResponse({ status: 200, description: "Latest tweet" })
  async getLatestTweet(
    @Param("username") username: string,
  ): Promise<ApiResponseDto<TweetDto | null>> {
    const data = await this.wrap(() => this.twitter.getLatestTweet(username));
    return ok(data as TweetDto | null, data ? `Latest tweet for @${username}` : `No tweets found for @${username}`);
  }

  @Get("tweets/:username/replies")
  @ApiOperation({ summary: "Get tweets and replies for a user" })
  @ApiParam({ name: "username", example: "ensp1re" })
  @ApiQuery({ name: "count", required: false, example: "5", description: "1-100" })
  @ApiResponse({ status: 200, description: "Tweets and replies fetched" })
  async getTweetsAndReplies(
    @Param("username") username: string,
    @Query() query: CountQueryDto,
  ): Promise<ApiResponseDto<TweetDto[]>> {
    const count = clampCount(query.count, 5, 100);
    const data = await this.wrap(() => this.twitter.getTweetsAndReplies(username, count));
    return ok(data as TweetDto[], `Fetched ${(data as TweetDto[]).length} tweets & replies for @${username}`);
  }

  // -----------------------------------------------------------------------
  // Search
  // -----------------------------------------------------------------------

  @Get("search")
  @ApiOperation({ summary: "Search tweets" })
  @ApiQuery({ name: "q", required: true, example: "bitcoin", description: "Search query" })
  @ApiQuery({ name: "count", required: false, example: "20", description: "1-100" })
  @ApiQuery({ name: "mode", required: false, enum: ["latest", "top", "photos", "videos", "users"], description: "Search mode" })
  @ApiResponse({ status: 200, description: "Search results" })
  @ApiResponse({ status: 400, description: "Missing q parameter" })
  async search(
    @Query() query: SearchQueryDto,
  ): Promise<ApiResponseDto<SearchResultDto>> {
    if (!query.q) {
      throw new HttpException(
        { message: "Validation failed", errors: [{ field: "q", message: "Search query is required" }] as ApiErrorDetail[] },
        HttpStatus.BAD_REQUEST,
      );
    }
    const count = clampCount(query.count, 20, 100);
    const mode = query.mode ?? "latest";
    const data = await this.wrap(() => this.twitter.searchTweets(query.q, count, mode));
    return ok(data as SearchResultDto, `Search results for "${query.q}"`);
  }

  // -----------------------------------------------------------------------
  // Profile
  // -----------------------------------------------------------------------

  @Get("profile/:username")
  @ApiOperation({ summary: "Get user profile" })
  @ApiParam({ name: "username", example: "ensp1re" })
  @ApiResponse({ status: 200, description: "Profile fetched" })
  async getProfile(
    @Param("username") username: string,
  ): Promise<ApiResponseDto<ProfileDto>> {
    const data = await this.wrap(() => this.twitter.getProfile(username));
    return ok(data as unknown as ProfileDto, `Profile for @${username}`);
  }

  @Get("followers/:username")
  @ApiOperation({ summary: "Get followers of a user" })
  @ApiParam({ name: "username", example: "ensp1re" })
  @ApiQuery({ name: "count", required: false, example: "50", description: "1-200" })
  @ApiResponse({ status: 200, description: "Followers fetched" })
  async getFollowers(
    @Param("username") username: string,
    @Query() query: FollowQueryDto,
  ): Promise<ApiResponseDto<FollowListDto>> {
    const count = clampCount(query.count, 50, 200);
    const data = await this.wrap(() => this.twitter.getFollowers(username, count));
    return ok(data as unknown as FollowListDto, `Followers for @${username}`);
  }

  @Get("following/:username")
  @ApiOperation({ summary: "Get users followed by a user" })
  @ApiParam({ name: "username", example: "ensp1re" })
  @ApiQuery({ name: "count", required: false, example: "50", description: "1-200" })
  @ApiResponse({ status: 200, description: "Following list fetched" })
  async getFollowing(
    @Param("username") username: string,
    @Query() query: FollowQueryDto,
  ): Promise<ApiResponseDto<FollowListDto>> {
    const count = clampCount(query.count, 50, 200);
    const data = await this.wrap(() => this.twitter.getFollowing(username, count));
    return ok(data as unknown as FollowListDto, `Following list for @${username}`);
  }

  // -----------------------------------------------------------------------
  // Single tweet
  // -----------------------------------------------------------------------

  @Get("tweet/:id")
  @ApiOperation({ summary: "Get a single tweet by ID" })
  @ApiParam({ name: "id", example: "2019881223666233717" })
  @ApiResponse({ status: 200, description: "Tweet fetched" })
  @ApiResponse({ status: 404, description: "Tweet not found" })
  async getTweet(
    @Param("id") id: string,
  ): Promise<ApiResponseDto<TweetDto | null>> {
    const data = await this.wrap(() => this.twitter.getTweetById(id));
    return ok(data as TweetDto | null, data ? `Tweet ${id}` : `Tweet ${id} not found`);
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
        { message: error.message.slice(0, 300), errors: null },
        status,
      );
    }
  }
}

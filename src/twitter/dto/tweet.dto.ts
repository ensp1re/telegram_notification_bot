import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class TweetDto {
  @ApiProperty({ example: "2019881223666233717" })
  id!: string;

  @ApiPropertyOptional({ example: "Hello world!" })
  text?: string;

  @ApiPropertyOptional({ example: "XDevelopers" })
  username?: string;

  @ApiPropertyOptional({ example: "Developers" })
  name?: string;

  @ApiProperty({ example: 0 })
  likes!: number;

  @ApiProperty({ example: 0 })
  retweets!: number;

  @ApiProperty({ example: 0 })
  replies!: number;

  @ApiPropertyOptional({ example: "2026-02-06T21:09:45.000Z" })
  timeParsed?: string;

  @ApiPropertyOptional({ example: "https://x.com/XDevelopers/status/2019881223666233717" })
  permanentUrl?: string;

  @ApiProperty({ example: false })
  isRetweet!: boolean;

  @ApiProperty({ example: false })
  isReply!: boolean;

  @ApiProperty({ type: [String] })
  photos!: string[];

  @ApiProperty({ type: [String] })
  videos!: string[];

  @ApiProperty({ type: [String] })
  urls!: string[];

  @ApiProperty({ type: [String] })
  hashtags!: string[];

  [key: string]: unknown;
}

export class SearchResultDto {
  @ApiProperty({ type: [TweetDto] })
  tweets!: TweetDto[];

  @ApiPropertyOptional({ example: null, nullable: true })
  next?: string | null;
}

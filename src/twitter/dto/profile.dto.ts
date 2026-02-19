import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class ProfileDto {
  @ApiPropertyOptional({ example: "ensp1re" })
  username?: string;

  @ApiPropertyOptional({ example: "Enspire" })
  name?: string;

  @ApiPropertyOptional({ example: "1548005004388098055" })
  userId?: string;

  @ApiPropertyOptional({ example: "Builder" })
  biography?: string;

  @ApiPropertyOptional({ example: 150 })
  followersCount?: number;

  @ApiPropertyOptional({ example: 100 })
  followingCount?: number;

  @ApiPropertyOptional({ example: 500 })
  tweetsCount?: number;

  @ApiPropertyOptional({ example: true })
  isVerified?: boolean;

  @ApiPropertyOptional()
  joined?: string;

  @ApiPropertyOptional()
  avatar?: string;

  @ApiPropertyOptional()
  banner?: string;

  @ApiPropertyOptional()
  location?: string;

  @ApiPropertyOptional()
  website?: string;

  [key: string]: unknown;
}

export class FollowListDto {
  @ApiProperty({ type: [ProfileDto] })
  profiles!: ProfileDto[];

  @ApiPropertyOptional({ nullable: true })
  next?: string | null;
}

import { ApiPropertyOptional, ApiProperty } from "@nestjs/swagger";
import { IsOptional, IsString, IsNumberString, IsIn } from "class-validator";

export class CountQueryDto {
  @ApiPropertyOptional({
    description: "Number of items to return (1-100)",
    example: "5",
    default: "5",
  })
  @IsOptional()
  @IsNumberString()
  count?: string;
}

export class SearchQueryDto {
  @ApiProperty({ description: "Search query string", example: "bitcoin" })
  @IsString()
  q!: string;

  @ApiPropertyOptional({
    description: "Number of results (1-100)",
    example: "20",
    default: "20",
  })
  @IsOptional()
  @IsNumberString()
  count?: string;

  @ApiPropertyOptional({
    description: "Search mode",
    enum: ["latest", "top"],
    default: "latest",
  })
  @IsOptional()
  @IsIn(["latest", "top"])
  mode?: "latest" | "top";
}

export class FollowQueryDto {
  @ApiPropertyOptional({
    description: "Number of profiles (1-200)",
    example: "50",
    default: "50",
  })
  @IsOptional()
  @IsNumberString()
  count?: string;
}

import { Transform, Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsISO8601,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Matches,
  Max,
  MinLength,
  Min,
  IsUUID,
  ValidateNested,
} from "class-validator";

export class ExportEventsQueryDto {
  @IsOptional()
  @IsUUID("4")
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 25;
}

export class CreateCalendarDto {
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;
  @Matches(/^#[0-9a-fA-F]{6}$/) color!: string;
  @IsString() @MinLength(1) @MaxLength(100) timeZone!: string;
}

export class AttendeeDto {
  @IsEmail() @MaxLength(320) email!: string;
  @IsOptional() @IsString() @MaxLength(120) displayName?: string;
  @IsIn(["needs-action", "accepted", "declined", "tentative"])
  response!: "needs-action" | "accepted" | "declined" | "tentative";
}

export class CreateEventDto {
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  title!: string;
  @IsOptional() @IsString() @MaxLength(10_000) description?: string;
  @IsOptional() @IsString() @MaxLength(500) location?: string;
  @IsISO8601({ strict: true }) start!: string;
  @IsISO8601({ strict: true }) end!: string;
  @IsBoolean() allDay!: boolean;
  @IsString() @MinLength(1) @MaxLength(100) timeZone!: string;
  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  @Matches(/^(?:RRULE:)?[A-Z0-9=;,\-+]+$/)
  recurrenceRule?: string;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(1_000)
  @IsISO8601({ strict: true }, { each: true })
  recurrenceExceptions?: string[];
  @IsIn(["confirmed", "tentative", "cancelled"])
  status!: "confirmed" | "tentative" | "cancelled";
  @IsIn(["default", "public", "private"])
  visibility!: "default" | "public" | "private";
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => AttendeeDto)
  attendees!: AttendeeDto[];
}

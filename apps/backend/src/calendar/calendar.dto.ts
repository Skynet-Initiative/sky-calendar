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
  IsUrl,
  MaxLength,
  Matches,
  Max,
  MinLength,
  Min,
  IsUUID,
  ValidateNested,
} from "class-validator";

const trim = () =>
  Transform(({ value }) => (typeof value === "string" ? value.trim() : value));

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
  @trim() @IsString() @MinLength(1) @MaxLength(100) name!: string;
  @Matches(/^#[0-9a-fA-F]{6}$/) color!: string;
  @IsString() @MinLength(1) @MaxLength(100) timeZone!: string;
}

/** Every field is optional; an absent field keeps its current value. */
export class UpdateCalendarDto {
  @IsOptional() @trim() @IsString() @MinLength(1) @MaxLength(100) name?: string;
  @IsOptional() @Matches(/^#[0-9a-fA-F]{6}$/) color?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(100) timeZone?: string;
}

export class AttendeeDto {
  @IsEmail() @MaxLength(320) email!: string;
  @IsOptional() @IsString() @MaxLength(120) displayName?: string;
  @IsIn(["needs-action", "accepted", "declined", "tentative"])
  response!: "needs-action" | "accepted" | "declined" | "tentative";
}

/**
 * A video conference attached to the event. The calendar only keeps what is
 * needed to join: the provider's stable identifier and the link. The provider
 * decides who gets in.
 */
export class ConferenceDto {
  @IsIn(["skydirect"]) provider!: "skydirect";
  @Matches(/^[A-Za-z0-9_-]{1,128}$/) id!: string;
  @IsUrl({ protocols: ["https"], require_protocol: true })
  @MaxLength(2_048)
  joinUrl!: string;
}

export class CreateEventDto {
  @trim() @IsString() @MinLength(1) @MaxLength(300) title!: string;
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
  /** `null` and absent both mean "no conference". */
  @IsOptional()
  @ValidateNested()
  @Type(() => ConferenceDto)
  conference?: ConferenceDto | null;
}

/** A replacement may also move the event to another calendar of the workspace. */
export class ReplaceEventDto extends CreateEventDto {
  @IsOptional() @IsUUID("4") calendarId?: string;
}

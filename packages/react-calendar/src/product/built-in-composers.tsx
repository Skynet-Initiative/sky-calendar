"use client";

import {
  useId,
  useRef,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { useFocusTrap } from "../a11y/use-focus-trap";
import { CALENDAR_COLORS } from "./model";
import type {
  SkyCalendarCalendarComposerRenderProps,
  SkyCalendarEventComposerRenderProps,
} from "./sky-calendar-workspace";

/**
 * The composers the workspace renders when its host supplies none. They are
 * complete and accessible, and deliberately plain: a host with a design
 * system replaces them through `eventComposer` / `calendarComposer` and
 * receives exactly the same props.
 */

const REPEAT_OPTIONS: readonly { value: string; label: string }[] = [
  { value: "", label: "Does not repeat" },
  { value: "FREQ=DAILY", label: "Every day" },
  { value: "FREQ=WEEKLY", label: "Every week" },
  { value: "FREQ=MONTHLY", label: "Every month" },
  { value: "FREQ=YEARLY", label: "Every year" },
];

function Dialog({
  label,
  onClose,
  children,
}: {
  label: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  useFocusTrap(panel, true);
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Escape") return;
    event.preventDefault();
    onClose();
  }
  return (
    <div className="skycal__scrim" onClick={onClose} role="presentation">
      <div
        className="skycal__dialog"
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        ref={panel}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        {children}
      </div>
    </div>
  );
}

export function BuiltInEventComposer(
  props: SkyCalendarEventComposerRenderProps,
) {
  const id = useId();
  const { draft, editable } = props;
  const dateOnly = draft.allDay;

  function onField(
    event: ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >,
  ) {
    const target = event.currentTarget;
    switch (target.name) {
      case "title":
      case "location":
      case "description":
      case "recurrenceRule":
      case "attendees":
      case "calendarId":
        props.onChange(target.name, target.value);
        break;
      case "scope":
        props.onChange(
          "scope",
          target.value === "series" ? "series" : "occurrence",
        );
        break;
      case "allDay":
        props.onChange("allDay", (target as HTMLInputElement).checked);
        break;
    }
  }

  function onStart(event: ChangeEvent<HTMLInputElement>) {
    props.onChange(
      "start",
      dateOnly
        ? `${event.currentTarget.value}T00:00`
        : event.currentTarget.value,
    );
  }

  function onEnd(event: ChangeEvent<HTMLInputElement>) {
    props.onChange(
      "end",
      dateOnly
        ? `${event.currentTarget.value}T00:00`
        : event.currentTarget.value,
    );
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    props.onSubmit(event);
  }

  const title = draft.id ? (editable ? "Edit event" : "Event") : "New event";

  return (
    <Dialog label={title} onClose={props.onClose}>
      <form className="skycal__form" onSubmit={onSubmit}>
        <header className="skycal__form-head">
          <h2>{title}</h2>
          <p className="skycal__muted">{props.scheduleLabel}</p>
        </header>
        <label className="skycal__field">
          <span>Title</span>
          <input
            name="title"
            value={draft.title}
            onChange={onField}
            maxLength={300}
            required
            readOnly={!editable}
            autoFocus={editable}
          />
        </label>
        <div className="skycal__field-row">
          <label className="skycal__field">
            <span>{dateOnly ? "First day" : "Starts"}</span>
            <input
              name="start"
              type={dateOnly ? "date" : "datetime-local"}
              value={dateOnly ? draft.start.slice(0, 10) : draft.start}
              onChange={onStart}
              required
              readOnly={!editable}
            />
          </label>
          <label className="skycal__field">
            <span>{dateOnly ? "Last day" : "Ends"}</span>
            <input
              name="end"
              type={dateOnly ? "date" : "datetime-local"}
              value={dateOnly ? draft.end.slice(0, 10) : draft.end}
              onChange={onEnd}
              required
              readOnly={!editable}
            />
          </label>
        </div>
        <label className="skycal__check">
          <input
            name="allDay"
            type="checkbox"
            checked={draft.allDay}
            onChange={onField}
            disabled={!editable}
          />
          <span>All day</span>
        </label>
        {draft.conference ? (
          <div className="skycal__conference">
            <a href={draft.conference.joinUrl} target="_blank" rel="noreferrer">
              Join the video call
            </a>
            {editable ? (
              <button
                type="button"
                className="skycal__button skycal__button--quiet"
                onClick={() => props.onChange("conference", null)}
              >
                Remove
              </button>
            ) : null}
          </div>
        ) : null}
        {props.calendars.length > 1 ? (
          <label className="skycal__field">
            <span>Calendar</span>
            <select
              name="calendarId"
              value={draft.calendarId}
              onChange={onField}
              disabled={!editable}
            >
              {props.calendars.map((calendar) => (
                <option key={calendar.id} value={calendar.id}>
                  {calendar.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {draft.occurrenceStart && editable ? (
          <label className="skycal__field">
            <span>Apply to</span>
            <select name="scope" value={draft.scope} onChange={onField}>
              <option value="occurrence">This occurrence</option>
              <option value="series">The whole series</option>
            </select>
          </label>
        ) : null}
        <label className="skycal__field">
          <span>Location</span>
          <input
            name="location"
            value={draft.location}
            onChange={onField}
            maxLength={500}
            readOnly={!editable}
          />
        </label>
        <label className="skycal__field">
          <span>Guests</span>
          <input
            name="attendees"
            type="email"
            multiple
            value={draft.attendees}
            onChange={onField}
            placeholder="name@example.com, …"
            readOnly={!editable}
          />
        </label>
        <label className="skycal__field">
          <span>Repeat</span>
          <select
            name="recurrenceRule"
            value={
              REPEAT_OPTIONS.some(
                (option) => option.value === draft.recurrenceRule,
              )
                ? draft.recurrenceRule
                : "custom"
            }
            onChange={onField}
            disabled={!editable}
          >
            {REPEAT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
            {REPEAT_OPTIONS.some(
              (option) => option.value === draft.recurrenceRule,
            ) ? null : (
              <option value="custom">
                Custom rule ({draft.recurrenceRule})
              </option>
            )}
          </select>
        </label>
        <label className="skycal__field">
          <span>Description</span>
          <textarea
            name="description"
            value={draft.description}
            onChange={onField}
            maxLength={10_000}
            rows={3}
            readOnly={!editable}
          />
        </label>
        {props.error ? (
          <p className="skycal__error" role="alert" id={`${id}-error`}>
            {props.error}
          </p>
        ) : null}
        <footer className="skycal__form-actions">
          {editable && draft.id ? (
            <button
              type="button"
              className="skycal__button skycal__button--danger"
              onClick={props.onDelete}
              disabled={props.saving}
            >
              Delete
            </button>
          ) : null}
          <span className="skycal__spacer" />
          <button
            type="button"
            className="skycal__button"
            onClick={props.onClose}
          >
            {editable ? "Cancel" : "Close"}
          </button>
          {editable ? (
            <button
              type="submit"
              className="skycal__button skycal__button--primary"
              disabled={props.saving}
            >
              {props.saving ? "Saving…" : "Save"}
            </button>
          ) : null}
        </footer>
      </form>
    </Dialog>
  );
}

export function BuiltInCalendarComposer(
  props: SkyCalendarCalendarComposerRenderProps,
) {
  const title = props.draft.id ? "Edit calendar" : "New calendar";
  return (
    <Dialog label={title} onClose={props.onClose}>
      <form className="skycal__form" onSubmit={props.onSubmit}>
        <header className="skycal__form-head">
          <h2>{title}</h2>
        </header>
        <label className="skycal__field">
          <span>Name</span>
          <input
            name="name"
            value={props.draft.name}
            onChange={(event) =>
              props.onChange("name", event.currentTarget.value)
            }
            maxLength={100}
            required
            autoFocus
          />
        </label>
        <fieldset className="skycal__swatches">
          <legend>Color</legend>
          {CALENDAR_COLORS.map((color) => (
            <label
              key={color}
              className="skycal__swatch"
              style={{ "--swatch": color } as React.CSSProperties}
            >
              <input
                type="radio"
                name="color"
                value={color}
                checked={props.draft.color === color}
                onChange={() => props.onChange("color", color)}
              />
              <span className="skycal__visually-hidden">{color}</span>
            </label>
          ))}
        </fieldset>
        {props.error ? (
          <p className="skycal__error" role="alert">
            {props.error}
          </p>
        ) : null}
        <footer className="skycal__form-actions">
          {props.draft.id ? (
            <button
              type="button"
              className="skycal__button skycal__button--danger"
              onClick={props.onDelete}
              disabled={props.saving}
            >
              Delete
            </button>
          ) : null}
          <span className="skycal__spacer" />
          <button
            type="button"
            className="skycal__button"
            onClick={props.onClose}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="skycal__button skycal__button--primary"
            disabled={props.saving}
          >
            {props.saving ? "Saving…" : "Save"}
          </button>
        </footer>
      </form>
    </Dialog>
  );
}

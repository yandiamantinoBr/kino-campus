import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

export const sessions = sqliteTable("pitch_sessions", {
  code: text("code").primaryKey(),
  duration: integer("duration").notNull(),
  mode: text("mode").notNull(),
  currentSlide: integer("current_slide").notNull().default(0),
  activePrompt: text("active_prompt"),
  presenterToken: text("presenter_token").notNull(),
  status: text("status").notNull().default("live"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const responses = sqliteTable(
  "pitch_responses",
  {
    sessionCode: text("session_code")
      .notNull()
      .references(() => sessions.code, { onDelete: "cascade" }),
    promptId: text("prompt_id").notNull(),
    participantId: text("participant_id").notNull(),
    value: text("value").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    primaryKey({
      columns: [table.sessionCode, table.promptId, table.participantId],
    }),
    index("pitch_responses_session_idx").on(table.sessionCode),
  ],
);


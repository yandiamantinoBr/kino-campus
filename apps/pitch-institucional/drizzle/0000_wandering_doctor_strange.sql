CREATE TABLE `pitch_responses` (
	`session_code` text NOT NULL,
	`prompt_id` text NOT NULL,
	`participant_id` text NOT NULL,
	`value` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`session_code`, `prompt_id`, `participant_id`),
	FOREIGN KEY (`session_code`) REFERENCES `pitch_sessions`(`code`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `pitch_responses_session_idx` ON `pitch_responses` (`session_code`);--> statement-breakpoint
CREATE TABLE `pitch_sessions` (
	`code` text PRIMARY KEY NOT NULL,
	`duration` integer NOT NULL,
	`mode` text NOT NULL,
	`current_slide` integer DEFAULT 0 NOT NULL,
	`active_prompt` text,
	`presenter_token` text NOT NULL,
	`status` text DEFAULT 'live' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);

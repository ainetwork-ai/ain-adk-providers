import type { ScheduleRun } from "@ainetwork/adk/types/schedule";
import { type Document, Schema } from "mongoose";
import mongoose from "mongoose";

export const ScheduleRunSchema = new Schema(
	{
		runId: {
			type: String,
			required: true,
			unique: true,
		},
		jobType: {
			type: String,
			required: true,
			index: true,
		},
		jobKey: {
			type: String,
			required: true,
			index: true,
		},
		trigger: {
			type: String,
			required: true,
		},
		scheduledFor: {
			type: Number,
			required: true,
		},
		startedAt: {
			type: Number,
			required: true,
			index: true,
		},
		finishedAt: {
			type: Number,
		},
		status: {
			type: String,
			required: true,
			index: true,
		},
		attempts: {
			type: Number,
			required: true,
			default: 0,
		},
		error: {
			type: String,
		},
		// Per-slot outcomes (SLOT_REFRESH only). Free-form so the schema doesn't
		// strip entries on update (mongoose strict mode).
		slotResults: {
			type: Schema.Types.Mixed,
		},
		// TTL 앵커 (스토리지 내부 전용 — ADK ScheduleRun 타입에는 노출하지 않는다).
		// 나머지 타임스탬프는 epoch ms Number라 TTL 인덱스를 걸 수 없어 Date로 둔다.
		createdAt: {
			type: Date,
			default: Date.now,
		},
	},
	{
		collection: "schedule_runs",
	}
);

// 이력 조회(listScheduleRuns)의 주 패턴인 "jobKey 필터 + startedAt 최신순"을
// 하나의 인덱스로 커버한다. 이력은 실행마다 쌓이는 무한 성장 컬렉션이라 미리 둔다.
ScheduleRunSchema.index({ jobKey: 1, startedAt: -1 });

// 실행 이력은 무한 성장 컬렉션이라 90일 경과분을 MongoDB TTL로 자동 삭제한다.
// 주의: 이미 생성된 인덱스의 expireAfterSeconds는 mongoose가 갱신하지 않으므로
// (IndexOptionsConflict), 보존 기간 변경 시 collMod 또는 인덱스 재생성이 필요하다.
const SCHEDULE_RUN_TTL_SECONDS = 60 * 60 * 24 * 90;
ScheduleRunSchema.index(
	{ createdAt: 1 },
	{ expireAfterSeconds: SCHEDULE_RUN_TTL_SECONDS }
);

export type ScheduleRunDocument = ScheduleRun & Document;

export const ScheduleRunModel = mongoose.model<ScheduleRunDocument>(
	"ScheduleRun",
	ScheduleRunSchema
);

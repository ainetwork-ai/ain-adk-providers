import { MongoDBDocument } from "../implements/document.memory";
import { MongoDBIntent } from "../implements/intent.memory";
import { MongoDBScheduleRun } from "../implements/schedule-run.memory";
import { MongoDBThread } from "../implements/thread.memory";
import { MongoDBUserWorkflow } from "../implements/user-workflow.memory";
import { MongoDBWorkflowTemplate } from "../implements/workflow-template.memory";
import { DocumentModel } from "../models/document.model";
import { IntentModel } from "../models/intent.model";
import { MessageModel } from "../models/messages.model";
import { ScheduleRunModel } from "../models/schedule-run.model";
import { ThreadModel } from "../models/threads.model";
import { UserWorkflowModel } from "../models/user-workflow.model";
import { WorkflowTemplateModel } from "../models/workflow-template.model";

const passthrough = async <T>(operation: () => Promise<T>): Promise<T> =>
	operation();
const timeout = (): number => 1000;

const updateResult = (matchedCount: number) => ({
	maxTimeMS: jest.fn().mockResolvedValue({ matchedCount }),
});

afterEach(() => {
	jest.restoreAllMocks();
});

describe("honest updates: matchedCount checks", () => {
	describe("MongoDBThread", () => {
		const thread = new MongoDBThread(passthrough, timeout);

		it("addMessagesToThread throws when the thread does not exist and writes no messages", async () => {
			jest
				.spyOn(ThreadModel, "updateOne")
				.mockResolvedValue({ matchedCount: 0 } as never);
			const deleteSpy = jest
				.spyOn(MessageModel, "deleteMany")
				.mockResolvedValue({} as never);
			const insertSpy = jest
				.spyOn(MessageModel, "insertMany")
				.mockResolvedValue([] as never);

			await expect(
				thread.addMessagesToThread("u1", "t1", [
					{
						messageId: "m1",
						role: "USER" as never,
						content: "hi",
						timestamp: Date.now(),
					},
				]),
			).rejects.toThrow("Thread not found: t1");
			expect(deleteSpy).not.toHaveBeenCalled();
			expect(insertSpy).not.toHaveBeenCalled();
		});

		it("addMessagesToThread succeeds when the thread exists", async () => {
			jest
				.spyOn(ThreadModel, "updateOne")
				.mockResolvedValue({ matchedCount: 1 } as never);
			jest.spyOn(MessageModel, "deleteMany").mockResolvedValue({} as never);
			const insertSpy = jest
				.spyOn(MessageModel, "insertMany")
				.mockResolvedValue([] as never);

			await expect(
				thread.addMessagesToThread("u1", "t1", [
					{
						messageId: "m1",
						role: "USER" as never,
						content: "hi",
						timestamp: Date.now(),
					},
				]),
			).resolves.toBeUndefined();
			expect(insertSpy).toHaveBeenCalled();
		});

		it("updateThreadPin throws when the thread does not exist", async () => {
			jest
				.spyOn(ThreadModel, "updateOne")
				.mockReturnValue(updateResult(0) as never);

			await expect(thread.updateThreadPin("u1", "t1", true)).rejects.toThrow(
				"Thread not found: t1",
			);
		});
	});

	describe("MongoDBIntent", () => {
		const intent = new MongoDBIntent(passthrough, timeout);

		it("updateIntent throws when the intent does not exist", async () => {
			jest
				.spyOn(IntentModel, "updateOne")
				.mockReturnValue(updateResult(0) as never);

			await expect(
				intent.updateIntent("i1", { id: "i1", name: "n" } as never),
			).rejects.toThrow("Intent not found: i1");
		});
	});

	describe("MongoDBDocument", () => {
		const document = new MongoDBDocument(passthrough, timeout);

		it("updateDocument throws when the document does not exist", async () => {
			jest
				.spyOn(DocumentModel, "updateOne")
				.mockReturnValue(updateResult(0) as never);

			await expect(document.updateDocument("d1", {})).rejects.toThrow(
				"Document not found: d1",
			);
		});

		it("updateDocument resolves when the document matched", async () => {
			jest
				.spyOn(DocumentModel, "updateOne")
				.mockReturnValue(updateResult(1) as never);

			await expect(document.updateDocument("d1", {})).resolves.toBeUndefined();
		});

		it("updateDocumentSlot throws when nothing matched", async () => {
			jest
				.spyOn(DocumentModel, "updateOne")
				.mockReturnValue(updateResult(0) as never);

			await expect(document.updateDocumentSlot("d1", "s1", {})).rejects.toThrow(
				"Document or slot not found: d1/s1",
			);
		});

		it("markAutoRefreshSlotDone throws when the document does not exist", async () => {
			jest
				.spyOn(DocumentModel, "updateOne")
				.mockReturnValue(updateResult(0) as never);

			await expect(
				document.markAutoRefreshSlotDone("d1", "s1"),
			).rejects.toThrow("Document not found: d1");
		});

		it("completeAutoRefresh throws when the document does not exist", async () => {
			jest
				.spyOn(DocumentModel, "updateOne")
				.mockReturnValue(updateResult(0) as never);

			await expect(
				document.completeAutoRefresh("d1", Date.now()),
			).rejects.toThrow("Document not found: d1");
		});
	});

	describe("MongoDBUserWorkflow", () => {
		const userWorkflow = new MongoDBUserWorkflow(passthrough, timeout);

		it("updateUserWorkflow throws when the workflow does not exist", async () => {
			jest
				.spyOn(UserWorkflowModel, "updateOne")
				.mockReturnValue(updateResult(0) as never);

			await expect(
				userWorkflow.updateUserWorkflow("w1", { userId: "u1" } as never),
			).rejects.toThrow("UserWorkflow not found: w1");
		});
	});

	describe("MongoDBWorkflowTemplate", () => {
		const template = new MongoDBWorkflowTemplate(passthrough, timeout);

		it("updateTemplate throws when the template does not exist", async () => {
			jest
				.spyOn(WorkflowTemplateModel, "updateOne")
				.mockReturnValue(updateResult(0) as never);

			await expect(template.updateTemplate("t1", {})).rejects.toThrow(
				"WorkflowTemplate not found: t1",
			);
		});
	});

	describe("MongoDBScheduleRun", () => {
		const scheduleRun = new MongoDBScheduleRun(passthrough, timeout);

		it("updateScheduleRun throws when the run does not exist", async () => {
			jest
				.spyOn(ScheduleRunModel, "updateOne")
				.mockReturnValue(updateResult(0) as never);

			await expect(
				scheduleRun.updateScheduleRun("r1", { status: "success" } as never),
			).rejects.toThrow("ScheduleRun not found: r1");
		});
	});
});

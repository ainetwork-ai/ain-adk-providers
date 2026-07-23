import { WorkflowTemplateObjectSchema } from "../models/workflow-template.model";

describe("WorkflowTemplate schema", () => {
	it("declares hidden as a Boolean path (strict mode persists it)", () => {
		const path = WorkflowTemplateObjectSchema.path("hidden");
		expect(path).toBeDefined();
		expect(path.instance).toBe("Boolean");
	});
});

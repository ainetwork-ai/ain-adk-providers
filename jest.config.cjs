const { createDefaultPreset } = require("ts-jest");

const tsJestTransformCfg = createDefaultPreset().transform;

/** @type {import("jest").Config} **/
module.exports = {
	testEnvironment: "node",
	testMatch: ["<rootDir>/packages/**/tests/**/*.test.ts"],
	transform: {
		...tsJestTransformCfg,
	},
};

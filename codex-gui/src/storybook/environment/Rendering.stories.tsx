import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { FailureDiagnosticModal } from "@/feedback/FailureDiagnosticModal";

const meta = {
  id: "environment-rendering",
  title: "Environment/Rendering/Preview",
  component: FailureDiagnosticModal,
  args: { children: "Storybook rendering environment" },
} satisfies Meta<typeof FailureDiagnosticModal>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Diagnostics: Story = {};

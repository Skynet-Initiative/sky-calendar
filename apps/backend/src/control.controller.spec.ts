import { UnauthorizedException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { ControlController } from "./control.controller.js";

describe("ControlController", () => {
  it("purges a workspace only with the dedicated control token", async () => {
    const deleteWorkspace = vi.fn().mockResolvedValue(undefined);
    const controller = new ControlController(
      { deleteWorkspace } as never,
      { get: () => "calendar-control-token-at-least-32-characters" } as never,
    );

    await controller.deleteWorkspace(
      "cal_0123456789abcdef",
      "Bearer calendar-control-token-at-least-32-characters",
    );
    expect(deleteWorkspace).toHaveBeenCalledWith("cal_0123456789abcdef");
    expect(() =>
      controller.deleteWorkspace("cal_0123456789abcdef", "Bearer wrong-token"),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

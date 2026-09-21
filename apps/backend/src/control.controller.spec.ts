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
    await expect(
      controller.deleteWorkspace("cal_0123456789abcdef", "Bearer wrong-token"),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("rejects the previous token after rotation", async () => {
    const deleteWorkspace = vi.fn().mockResolvedValue(undefined);
    const controller = new ControlController(
      { deleteWorkspace } as never,
      {
        get: () => "rotated-calendar-control-token-at-least-32-characters",
      } as never,
    );

    await expect(
      controller.deleteWorkspace(
        "cal_0123456789abcdef",
        "Bearer calendar-control-token-at-least-32-characters",
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await controller.deleteWorkspace(
      "cal_0123456789abcdef",
      "Bearer rotated-calendar-control-token-at-least-32-characters",
    );
    expect(deleteWorkspace).toHaveBeenCalledTimes(1);
  });
});

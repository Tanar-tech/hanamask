/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { BackupSettings } from "../../src/renderer/components/BackupSettings";
import { stubHanamask } from "./hanamask-stub";
import type { BackupExportResult, BackupImportResult } from "../../src/shared/preload-api";

const EXPORT_LABEL = "書き出す";
const IMPORT_LABEL = "取り込む";

const SAVED: BackupExportResult = {
  status: "saved",
  filePath: "/home/me/hanamask-2026-08-08.zip",
  counts: { notes: 3, tasks: 2, images: 1 },
};

const IMPORTED: BackupImportResult = {
  status: "imported",
  counts: { notes: 3, tasks: 2, images: 1 },
  safetyCopyPath: "/home/me/.config/hanamask/backups/pre-import-2026.zip",
};

const clickButton = async (name: string): Promise<void> => {
  const button = await screen.findByRole("button", { name });
  await act(async () => {
    button.click();
  });
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("BackupSettings", () => {
  it("書き出した先と件数を知らせる", async () => {
    const exportBackup = vi.fn(async () => SAVED);
    stubHanamask({ exportBackup });

    render(<BackupSettings />);
    await clickButton(EXPORT_LABEL);

    expect(exportBackup).toHaveBeenCalled();
    expect(screen.getByText(/hanamask-2026-08-08\.zip/)).toBeTruthy();
    expect(screen.getByText(/ノート3件/)).toBeTruthy();
  });

  it("保存先を選ばずに閉じたときは何も知らせない", async () => {
    stubHanamask({ exportBackup: vi.fn(async () => ({ status: "cancelled" }) as const) });

    render(<BackupSettings />);
    await clickButton(EXPORT_LABEL);

    expect(screen.queryByRole("status")).toBeNull();
  });

  /* 取り込みは既存データを置き換える破壊的操作。押しただけでは実行させない。 */
  it("確認を断ったら取り込まない", async () => {
    const importBackup = vi.fn(async () => IMPORTED);
    stubHanamask({ importBackup });
    vi.spyOn(window, "confirm").mockReturnValue(false);

    render(<BackupSettings />);
    await clickButton(IMPORT_LABEL);

    expect(importBackup).not.toHaveBeenCalled();
  });

  it("確認したら取り込み、退避先を知らせる", async () => {
    const importBackup = vi.fn(async () => IMPORTED);
    stubHanamask({ importBackup });
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<BackupSettings />);
    await clickButton(IMPORT_LABEL);

    expect(importBackup).toHaveBeenCalled();
    expect(screen.getByText(/pre-import-2026\.zip/)).toBeTruthy();
  });

  it("取り込みに失敗したら理由を出す", async () => {
    stubHanamask({
      importBackup: vi.fn(() => Promise.reject(new Error("書庫が壊れています"))),
    });
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<BackupSettings />);
    await clickButton(IMPORT_LABEL);

    expect(screen.getByRole("alert").textContent).toContain("書庫が壊れています");
  });
});

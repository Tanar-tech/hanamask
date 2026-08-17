/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import {
  STANDING_INSTRUCTION,
  StandingInstruction,
} from "../../src/renderer/components/StandingInstruction";

const COPY_LABEL = "文面をコピー";

const stubClipboard = (writeText: (text: string) => Promise<void>): void => {
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
};

const clickCopy = async (): Promise<void> => {
  const button = await screen.findByRole("button", { name: COPY_LABEL });
  await act(async () => {
    button.click();
  });
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("STANDING_INSTRUCTION", () => {
  it("書くべきもの（区切り・決定・分かったこと・持ち越し）を並べる", () => {
    expect(STANDING_INSTRUCTION).toContain("作業の区切り");
    expect(STANDING_INSTRUCTION).toContain("決定");
    expect(STANDING_INSTRUCTION).toContain("次に持ち越すこと");
    expect(STANDING_INSTRUCTION).toContain("create_note");
    expect(STANDING_INSTRUCTION).toContain("list_tags");
  });

  it("着手前に search_notes で過去の経緯を引くよう促す", () => {
    expect(STANDING_INSTRUCTION).toContain("search_notes");
    expect(STANDING_INSTRUCTION).toMatch(/作業を始める前に/);
    expect(STANDING_INSTRUCTION).toMatch(/二度|蒸し返/);
  });

  it("ツールが見えないときは書かないと明記する", () => {
    expect(STANDING_INSTRUCTION).toMatch(/ツールが見えないときは書かない/);
    expect(STANDING_INSTRUCTION).toMatch(/MCP/);
  });

  it("リポジトリ内の作業ログがある場合はそちらが正だと示す", () => {
    expect(STANDING_INSTRUCTION).toMatch(/作業ログ/);
    expect(STANDING_INSTRUCTION).toMatch(/そちらが正/);
    expect(STANDING_INSTRUCTION).toMatch(/残らない/);
  });

  /* 「書き足してください」を前提にすると、貼っただけでは効かない文面になる。 */
  it("利用者への書き足し指示を含まない", () => {
    expect(STANDING_INSTRUCTION).not.toMatch(/ここに(記入|追記)|TODO|<.+を書く>/);
  });
});

describe("StandingInstruction", () => {
  it("見出しを出す", () => {
    render(<StandingInstruction />);

    expect(screen.getByRole("heading", { name: "エージェントに書く習慣を持たせる" })).toBeTruthy();
  });

  it("どこに貼るかを案内する", () => {
    render(<StandingInstruction />);

    const guide = screen.getByText(/~\/\.claude\/CLAUDE\.md/);
    expect(guide.textContent).toContain("常設指示");
  });

  it("文面を画面に出す", () => {
    render(<StandingInstruction />);

    expect(
      screen.getByText(STANDING_INSTRUCTION, { normalizer: (value) => value }),
    ).toBeTruthy();
  });

  it("文面そのものをクリップボードへ入れる", async () => {
    const writeText = vi.fn(async () => {});
    stubClipboard(writeText);

    render(<StandingInstruction />);
    await clickCopy();

    expect(writeText).toHaveBeenCalledWith(STANDING_INSTRUCTION);
    expect(await screen.findByRole("button", { name: "コピーしました" })).toBeTruthy();
  });

  it("コピーに失敗したら理由を出す", async () => {
    stubClipboard(() => Promise.reject(new Error("クリップボードを使えません")));

    render(<StandingInstruction />);
    await clickCopy();

    expect(screen.getByRole("alert").textContent).toContain("クリップボードを使えません");
  });
});

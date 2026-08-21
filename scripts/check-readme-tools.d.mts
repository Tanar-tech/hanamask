// tsconfig は allowJs:false なので、テストから .mjs を型付きで import するための宣言。
export function collectImplementedToolNames(toolsDir: string): Set<string>;

export function collectDocumentedToolNames(readmePath: string): Set<string>;

export function checkReadmeTools(): boolean;

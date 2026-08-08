import { crc32, deflateRawSync, inflateRawSync } from "node:zlib";

/*
 * ZIPの読み書き。書庫のためだけに依存を増やしたくないので、Nodeの標準zlibで組み立てる
 * （ZIPが使うのはDEFLATEの生ストリームとCRC-32で、どちらもzlibが持っている）。
 *
 * 対応するのはSTOREとDEFLATEのみ。自分たちが書いた書庫を読み戻せれば足りる。
 */
const LOCAL_HEADER_SIG = 0x04034b50;
const CENTRAL_HEADER_SIG = 0x02014b50;
const END_OF_CENTRAL_SIG = 0x06054b50;
const METHOD_STORE = 0;
const METHOD_DEFLATE = 8;
// 圧縮しても縮まないものは、そのまま入れた方が読み書きとも速い。
const DEFLATE_MIN_GAIN = 0.98;

export interface ZipEntry {
  path: string;
  data: Buffer;
}

const toEntryBytes = (entry: ZipEntry): { name: Buffer; body: Buffer; method: number } => {
  const name = Buffer.from(entry.path, "utf-8");
  const deflated = deflateRawSync(entry.data);
  const worthDeflating = deflated.length < entry.data.length * DEFLATE_MIN_GAIN;
  return worthDeflating
    ? { name, body: deflated, method: METHOD_DEFLATE }
    : { name, body: entry.data, method: METHOD_STORE };
};

export const writeZip = (entries: readonly ZipEntry[]): Buffer => {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  entries.forEach((entry) => {
    const { name, body, method } = toEntryBytes(entry);
    const sum = crc32(entry.data);

    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(LOCAL_HEADER_SIG, 0);
    local.writeUInt16LE(20, 4);
    // ビット11: ファイル名がUTF-8であることの印。日本語のファイル名でも化けないようにする。
    local.writeUInt16LE(1 << 11, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(sum, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    name.copy(local, 30);
    locals.push(local, body);

    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(CENTRAL_HEADER_SIG, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(1 << 11, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(sum, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(entry.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    name.copy(central, 46);
    centrals.push(central);

    offset += local.length + body.length;
  });

  const centralBytes = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(END_OF_CENTRAL_SIG, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBytes.length, 12);
  end.writeUInt32LE(offset, 16);

  return Buffer.concat([...locals, centralBytes, end]);
};

const findEndOfCentral = (buffer: Buffer): number => {
  // 末尾コメントがありうるので後ろから探す。自分たちが書いた書庫にコメントは無いが、
  // 手で作り直された書庫を読むこともある。
  for (let i = buffer.length - 22; i >= 0; i -= 1) {
    if (buffer.readUInt32LE(i) === END_OF_CENTRAL_SIG) return i;
  }
  throw new Error("ZIPとして読めません（終端レコードが見つかりません）");
};

/*
 * 取り込み時のパスは信用しない。`../` を含む名前で書庫の外へ書き出させる古典的な攻撃
 * （zip slip）を、読み取りの時点で弾く。
 */
const isSafePath = (path: string): boolean =>
  path !== "" &&
  !path.startsWith("/") &&
  !/^[a-zA-Z]:/.test(path) &&
  !path.split(/[/\\]/).includes("..");

export const readZip = (buffer: Buffer): ZipEntry[] => {
  const end = findEndOfCentral(buffer);
  const count = buffer.readUInt16LE(end + 10);
  let cursor = buffer.readUInt32LE(end + 16);
  const entries: ZipEntry[] = [];

  for (let i = 0; i < count; i += 1) {
    if (buffer.readUInt32LE(cursor) !== CENTRAL_HEADER_SIG) {
      throw new Error("ZIPとして読めません（中央ディレクトリが壊れています）");
    }
    const method = buffer.readUInt16LE(cursor + 10);
    const expectedCrc = buffer.readUInt32LE(cursor + 16);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localOffset = buffer.readUInt32LE(cursor + 42);
    const path = buffer.toString("utf-8", cursor + 46, cursor + 46 + nameLength);

    if (!isSafePath(path)) {
      throw new Error(`書庫の外を指すパスが含まれています: ${path}`);
    }

    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const bodyStart = localOffset + 30 + localNameLength + localExtraLength;
    const body = buffer.subarray(bodyStart, bodyStart + compressedSize);
    const data = method === METHOD_DEFLATE ? inflateRawSync(body) : Buffer.from(body);

    if (crc32(data) !== expectedCrc) {
      throw new Error(`書庫が壊れています: ${path}`);
    }
    entries.push({ path, data });

    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
};

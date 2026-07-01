import fs from "node:fs";
import path from "node:path";

const STREAM_TYPES = new Map([
  [3, "ThreadListStream"],
  [4, "ModuleListStream"],
  [5, "MemoryListStream"],
  [6, "ExceptionStream"],
  [7, "SystemInfoStream"],
  [8, "ThreadExListStream"],
  [9, "Memory64ListStream"],
  [15, "MiscInfoStream"],
  [16, "MemoryInfoListStream"],
]);

const ARCH_NAMES = new Map([
  [0, "x86"],
  [5, "ARM"],
  [6, "IA64"],
  [9, "x64"],
  [12, "ARM64"],
]);

const EXCEPTION_NAMES = new Map([
  [0xc0000005, "EXCEPTION_ACCESS_VIOLATION"],
  [0xc000001d, "EXCEPTION_ILLEGAL_INSTRUCTION"],
  [0xc000008c, "EXCEPTION_ARRAY_BOUNDS_EXCEEDED"],
  [0xc000008d, "EXCEPTION_FLT_DENORMAL_OPERAND"],
  [0xc000008e, "EXCEPTION_FLT_DIVIDE_BY_ZERO"],
  [0xc000008f, "EXCEPTION_FLT_INEXACT_RESULT"],
  [0xc0000090, "EXCEPTION_FLT_INVALID_OPERATION"],
  [0xc0000091, "EXCEPTION_FLT_OVERFLOW"],
  [0xc0000092, "EXCEPTION_FLT_STACK_CHECK"],
  [0xc0000093, "EXCEPTION_FLT_UNDERFLOW"],
  [0xc0000094, "EXCEPTION_INT_DIVIDE_BY_ZERO"],
  [0xc0000095, "EXCEPTION_INT_OVERFLOW"],
  [0xc0000096, "EXCEPTION_PRIV_INSTRUCTION"],
  [0xc00000fd, "EXCEPTION_STACK_OVERFLOW"],
  [0xc0000135, "STATUS_DLL_NOT_FOUND"],
  [0xc0000139, "STATUS_ENTRYPOINT_NOT_FOUND"],
  [0xe06d7363, "CPP_EH_EXCEPTION"],
]);

const args = parseArgs(process.argv.slice(2));
const dumpPath = resolveDumpPath(args);
const outputPath = args.out || args._[1] ? path.resolve(String(args.out ?? args._[1])) : null;
const buffer = fs.readFileSync(dumpPath);

const report = analyzeDump(buffer, dumpPath);
printReport(report);

if (outputPath) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`\nWrote ${outputPath}`);
}

function analyzeDump(input, filePath) {
  const header = parseHeader(input);
  const streams = parseStreams(input, header);
  const modules = parseModules(input, streams.get(4));
  const system = parseSystemInfo(input, streams.get(7));
  const exception = parseException(input, streams.get(6), modules, system);
  const threads = parseThreads(input, streams.get(3), modules, system, exception?.threadId);
  const memory = parseMemoryList(input, streams.get(5));
  const stack = exception ? findExceptionStack(input, threads, memory, modules, exception, system) : null;

  return {
    file: filePath,
    size: input.length,
    header,
    streams: [...streams.values()].map(({ type, name, dataSize, rva }) => ({ type, name, dataSize, rva })),
    system,
    exception,
    modules: modules.map(summarizeModule),
    threads: threads.map(summarizeThread),
    exceptionStackScan: stack,
    notes: buildNotes({ exception, system, stack }),
  };
}

function parseHeader(input) {
  assertRange(input, 0, 32, "minidump header");
  const signature = input.toString("ascii", 0, 4);
  if (signature !== "MDMP") {
    throw new Error(`Not a minidump file. Expected MDMP signature, got ${JSON.stringify(signature)}.`);
  }
  const timeDateStamp = readU32(input, 20);
  return {
    signature,
    version: readU32(input, 4),
    numberOfStreams: readU32(input, 8),
    streamDirectoryRva: readU32(input, 12),
    checksum: readU32(input, 16),
    timeDateStamp,
    timeDate: timeDateStamp > 0 ? new Date(timeDateStamp * 1000).toISOString() : null,
    flags: hex64(readU64(input, 24)),
  };
}

function parseStreams(input, header) {
  const streams = new Map();
  for (let index = 0; index < header.numberOfStreams; index += 1) {
    const offset = header.streamDirectoryRva + index * 12;
    assertRange(input, offset, 12, "stream directory");
    const type = readU32(input, offset);
    const dataSize = readU32(input, offset + 4);
    const rva = readU32(input, offset + 8);
    streams.set(type, {
      type,
      name: STREAM_TYPES.get(type) ?? `Stream${type}`,
      dataSize,
      rva,
    });
  }
  return streams;
}

function parseSystemInfo(input, stream) {
  if (!stream || stream.dataSize < 56) return null;
  const offset = stream.rva;
  const processorArchitecture = readU16(input, offset);
  const majorVersion = readU32(input, offset + 8);
  const minorVersion = readU32(input, offset + 12);
  const buildNumber = readU32(input, offset + 16);
  return {
    processorArchitecture,
    architecture: ARCH_NAMES.get(processorArchitecture) ?? `arch-${processorArchitecture}`,
    processorLevel: readU16(input, offset + 2),
    processorRevision: readU16(input, offset + 4),
    numberOfProcessors: input.readUInt8(offset + 6),
    productType: input.readUInt8(offset + 7),
    majorVersion,
    minorVersion,
    buildNumber,
    platformId: readU32(input, offset + 20),
    csdVersion: readMinidumpString(input, readU32(input, offset + 24)),
  };
}

function parseModules(input, stream) {
  if (!stream || stream.dataSize < 4) return [];
  const count = readU32(input, stream.rva);
  const modules = [];
  let offset = stream.rva + 4;
  for (let index = 0; index < count; index += 1) {
    assertRange(input, offset, 108, "module entry");
    const base = readU64(input, offset);
    const size = readU32(input, offset + 8);
    const timeDateStamp = readU32(input, offset + 16);
    const nameRva = readU32(input, offset + 20);
    modules.push({
      index,
      base,
      end: base + BigInt(size),
      size,
      checksum: readU32(input, offset + 12),
      timeDateStamp,
      timeDate: timeDateStamp > 0 ? new Date(timeDateStamp * 1000).toISOString() : null,
      name: readMinidumpString(input, nameRva),
    });
    offset += 108;
  }
  return modules.sort((a, b) => compareBigInt(a.base, b.base));
}

function parseException(input, stream, modules, system) {
  if (!stream || stream.dataSize < 168) return null;
  const offset = stream.rva;
  const threadId = readU32(input, offset);
  const recordOffset = offset + 8;
  const exceptionCode = readU32(input, recordOffset);
  const exceptionAddress = readU64(input, recordOffset + 16);
  const numberParameters = Math.min(readU32(input, recordOffset + 24), 15);
  const exceptionInformation = [];
  for (let index = 0; index < numberParameters; index += 1) {
    exceptionInformation.push(readU64(input, recordOffset + 32 + index * 8));
  }
  const contextLocation = {
    dataSize: readU32(input, offset + 160),
    rva: readU32(input, offset + 164),
  };
  const module = findModule(modules, exceptionAddress);
  return {
    threadId,
    exceptionCode: hex32(exceptionCode),
    exceptionName: EXCEPTION_NAMES.get(exceptionCode) ?? "UNKNOWN_EXCEPTION",
    exceptionFlags: hex32(readU32(input, recordOffset + 4)),
    exceptionRecord: hex64(readU64(input, recordOffset + 8)),
    exceptionAddress: hex64(exceptionAddress),
    exceptionModule: module ? moduleNameWithOffset(module, exceptionAddress) : null,
    numberParameters,
    exceptionInformation: exceptionInformation.map(hex64),
    accessViolation: describeAccessViolation(exceptionCode, exceptionInformation),
    threadContextLocation: contextLocation,
    context: parseThreadContext(input, contextLocation, system?.architecture, modules),
  };
}

function parseThreads(input, stream, modules, system, exceptionThreadId) {
  if (!stream || stream.dataSize < 4) return [];
  const count = readU32(input, stream.rva);
  const threads = [];
  let offset = stream.rva + 4;
  for (let index = 0; index < count; index += 1) {
    assertRange(input, offset, 48, "thread entry");
    const threadId = readU32(input, offset);
    const stack = {
      start: readU64(input, offset + 24),
      dataSize: readU32(input, offset + 32),
      rva: readU32(input, offset + 36),
    };
    const contextLocation = {
      dataSize: readU32(input, offset + 40),
      rva: readU32(input, offset + 44),
    };
    const context = parseThreadContext(input, contextLocation, system?.architecture, modules);
    threads.push({
      index,
      threadId,
      isExceptionThread: exceptionThreadId === threadId,
      suspendCount: readU32(input, offset + 4),
      priorityClass: readU32(input, offset + 8),
      priority: readU32(input, offset + 12),
      teb: readU64(input, offset + 16),
      stack,
      contextLocation,
      context,
    });
    offset += 48;
  }
  return threads;
}

function parseThreadContext(input, location, architecture, modules) {
  if (!location?.rva || location.dataSize < 32) return null;
  if (architecture === "x86" && location.dataSize >= 204) {
    const offset = location.rva;
    const eip = BigInt(readU32(input, offset + 184));
    const esp = BigInt(readU32(input, offset + 196));
    const ebp = BigInt(readU32(input, offset + 180));
    return {
      architecture: "x86",
      contextFlags: hex32(readU32(input, offset)),
      eax: hex32(readU32(input, offset + 176)),
      ebx: hex32(readU32(input, offset + 164)),
      ecx: hex32(readU32(input, offset + 172)),
      edx: hex32(readU32(input, offset + 168)),
      esi: hex32(readU32(input, offset + 160)),
      edi: hex32(readU32(input, offset + 156)),
      eip: hex64(eip),
      eipModule: moduleNameWithOffset(findModule(modules, eip), eip),
      esp: hex64(esp),
      ebp: hex64(ebp),
      eflags: hex32(readU32(input, offset + 192)),
    };
  }
  return {
    architecture: architecture ?? "unknown",
    rawContextSize: location.dataSize,
    note: "Context parser is implemented for x86 dumps only.",
  };
}

function parseMemoryList(input, stream) {
  if (!stream || stream.dataSize < 4) return [];
  const count = readU32(input, stream.rva);
  const ranges = [];
  let offset = stream.rva + 4;
  for (let index = 0; index < count; index += 1) {
    assertRange(input, offset, 16, "memory descriptor");
    const start = readU64(input, offset);
    const dataSize = readU32(input, offset + 8);
    const rva = readU32(input, offset + 12);
    ranges.push({
      index,
      start,
      end: start + BigInt(dataSize),
      dataSize,
      rva,
    });
    offset += 16;
  }
  return ranges;
}

function findExceptionStack(input, threads, memory, modules, exception, system) {
  const threadId = exception.threadId;
  const thread = threads.find((item) => item.threadId === threadId);
  if (!thread) return null;
  const range = memory.find((item) => item.start === thread.stack.start) ?? {
    start: thread.stack.start,
    end: thread.stack.start + BigInt(thread.stack.dataSize),
    dataSize: thread.stack.dataSize,
    rva: thread.stack.rva,
  };
  const arch = system?.architecture ?? thread.context?.architecture;
  if (arch !== "x86" || !range.rva || range.dataSize < 4) {
    return {
      note: "Stack scan is implemented for x86 stack memory only.",
      threadId,
      stackStart: hex64(thread.stack.start),
      stackSize: thread.stack.dataSize,
    };
  }

  const esp = exception.context?.esp ? BigInt(exception.context.esp) : thread.context?.esp ? BigInt(thread.context.esp) : range.start;
  const startOffset = clampNumber(Number(esp - range.start), 0, Math.max(0, range.dataSize - 4));
  const maxBytes = Math.min(range.dataSize - startOffset, 4096);
  const candidates = [];
  for (let rel = startOffset; rel + 4 <= startOffset + maxBytes; rel += 4) {
    const value = BigInt(readU32(input, range.rva + rel));
    const module = findModule(modules, value);
    if (!module) continue;
    candidates.push({
      stackAddress: hex64(range.start + BigInt(rel)),
      stackOffset: rel,
      value: hex64(value),
      module: moduleNameWithOffset(module, value),
    });
    if (candidates.length >= 64) break;
  }
  return {
    threadId,
    stackStart: hex64(range.start),
    stackEnd: hex64(range.end),
    stackSize: range.dataSize,
    esp: exception.context?.esp ?? thread.context?.esp ?? null,
    scannedBytes: maxBytes,
    candidates,
  };
}

function describeAccessViolation(exceptionCode, information) {
  if (exceptionCode !== 0xc0000005 || information.length < 2) return null;
  const accessType = Number(information[0]);
  const operation = accessType === 0 ? "read" : accessType === 1 ? "write" : accessType === 8 ? "execute" : `operation-${accessType}`;
  return {
    operation,
    address: hex64(information[1]),
  };
}

function summarizeModule(module) {
  return {
    index: module.index,
    name: module.name,
    base: hex64(module.base),
    end: hex64(module.end),
    size: module.size,
    timeDate: module.timeDate,
  };
}

function summarizeThread(thread) {
  return {
    index: thread.index,
    threadId: thread.threadId,
    isExceptionThread: thread.isExceptionThread,
    stackStart: hex64(thread.stack.start),
    stackSize: thread.stack.dataSize,
    context: thread.context,
  };
}

function buildNotes({ exception, system, stack }) {
  const notes = [];
  if (!exception) {
    notes.push("No ExceptionStream found. This dump may not contain the crashing exception.");
  } else if (exception.exceptionName === "EXCEPTION_ACCESS_VIOLATION") {
    notes.push(`Access violation during ${exception.accessViolation?.operation ?? "unknown operation"} at ${exception.accessViolation?.address ?? "unknown address"}.`);
  }
  if (system?.architecture !== "x86") {
    notes.push(`Dump architecture is ${system?.architecture ?? "unknown"}; only x86 context/stack parsing is detailed.`);
  }
  if (stack?.candidates?.length === 0) {
    notes.push("No stack values matched loaded module ranges in the first scanned stack window.");
  }
  return notes;
}

function printReport(report) {
  console.log(`Dump: ${report.file}`);
  console.log(`Size: ${report.size} bytes`);
  console.log(`Created: ${report.header.timeDate ?? "unknown"}`);
  console.log(`Streams: ${report.streams.map((item) => item.name).join(", ")}`);
  if (report.system) {
    console.log(`System: ${report.system.architecture}, Windows ${report.system.majorVersion}.${report.system.minorVersion}.${report.system.buildNumber}, CPUs=${report.system.numberOfProcessors}`);
  }
  if (report.exception) {
    console.log(`Exception: ${report.exception.exceptionName} (${report.exception.exceptionCode})`);
    console.log(`Thread: ${report.exception.threadId}`);
    console.log(`Address: ${report.exception.exceptionAddress}`);
    console.log(`Module: ${report.exception.exceptionModule ?? "unknown"}`);
    if (report.exception.accessViolation) {
      console.log(`Access: ${report.exception.accessViolation.operation} ${report.exception.accessViolation.address}`);
    }
  }
  const exceptionContext = report.exception?.context ?? report.threads.find((thread) => thread.isExceptionThread)?.context;
  if (exceptionContext) {
    console.log(`Context: EIP=${exceptionContext.eip ?? "n/a"} ESP=${exceptionContext.esp ?? "n/a"} EBP=${exceptionContext.ebp ?? "n/a"}`);
    if (exceptionContext.eipModule) console.log(`EIP module: ${exceptionContext.eipModule}`);
  }
  if (report.exceptionStackScan?.candidates?.length > 0) {
    console.log("Stack module candidates:");
    for (const item of report.exceptionStackScan.candidates.slice(0, 16)) {
      console.log(`  ${item.stackAddress}: ${item.value} ${item.module}`);
    }
  }
  if (report.notes.length > 0) {
    console.log("Notes:");
    for (const note of report.notes) console.log(`  - ${note}`);
  }
}

function readMinidumpString(input, rva) {
  if (!rva) return "";
  assertRange(input, rva, 4, "minidump string length");
  const byteLength = readU32(input, rva);
  if (byteLength === 0) return "";
  assertRange(input, rva + 4, byteLength, "minidump string");
  return input.toString("utf16le", rva + 4, rva + 4 + byteLength).replace(/\0+$/g, "");
}

function findModule(modules, address) {
  return modules.find((module) => address >= module.base && address < module.end) ?? null;
}

function moduleNameWithOffset(module, address) {
  if (!module) return null;
  const shortName = path.basename(module.name);
  return `${shortName}+${hex64(address - module.base)}`;
}

function assertRange(input, offset, size, label) {
  if (offset < 0 || size < 0 || offset + size > input.length) {
    throw new Error(`Invalid ${label} range: offset=${offset}, size=${size}, fileSize=${input.length}`);
  }
}

function readU16(input, offset) {
  return input.readUInt16LE(offset);
}

function readU32(input, offset) {
  return input.readUInt32LE(offset);
}

function readU64(input, offset) {
  return input.readBigUInt64LE(offset);
}

function hex32(value) {
  return `0x${Number(value >>> 0).toString(16).padStart(8, "0")}`;
}

function hex64(value) {
  return `0x${BigInt(value).toString(16).padStart(8, "0")}`;
}

function compareBigInt(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function clampNumber(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function parseArgs(argv) {
  const result = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) {
      result._.push(arg);
      continue;
    }
    const [key, inlineValue] = arg.slice(2).split("=", 2);
    if (inlineValue !== undefined) {
      result[key] = inlineValue;
      continue;
    }
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      result[key] = true;
    } else {
      result[key] = next;
      index += 1;
    }
  }
  return result;
}

function resolveDumpPath(parsedArgs) {
  const explicit = parsedArgs.dump ?? parsedArgs._[0];
  if (explicit) return path.resolve(String(explicit));
  if (parsedArgs.latestGameDump) {
    return findLatestDump(String(parsedArgs.userDir ?? "D:\\SteamLibrary\\steamapps\\common\\State of Decay YOSE\\USER"));
  }
  throw new Error("Usage: npm run analyze-dmp -- --dump <file.dmp> [--out output/reports/dmp-report.json]");
}

function findLatestDump(directory) {
  const files = fs
    .readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".dmp"))
    .map((entry) => {
      const fullPath = path.join(directory, entry.name);
      return { fullPath, mtimeMs: fs.statSync(fullPath).mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
  if (files.length === 0) {
    throw new Error(`No .dmp files found in ${directory}`);
  }
  return files[0].fullPath;
}

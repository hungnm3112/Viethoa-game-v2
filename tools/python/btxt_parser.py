import sys
import json
from construct import Struct, Const, Int32ul, Array, CString, this

Btxt = Struct(
    "magic" / Const(b"TXDB"),
    "version" / Int32ul,
    "reserved" / Int32ul,
    "count" / Int32ul,
    "hashes" / Array(this.count, Int32ul),
    "strings" / Array(this.count, CString(encoding="utf8"))
)

def parse_btxt(filepath):
    with open(filepath, "rb") as f:
        data = f.read()
    return Btxt.parse(data)

def build_btxt(filepath, parsed_data):
    with open(filepath, "wb") as f:
        f.write(Btxt.build(parsed_data))

def extract_to_json(btxt_path, json_path):
    parsed = parse_btxt(btxt_path)
    output = []
    for h, s in zip(parsed.hashes, parsed.strings):
        output.append({"hash": h, "string": s})
    with open(json_path, "w", encoding="utf8") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)
    print(f"Extracted {parsed.count} strings to {json_path}")

def rebuild_from_json(json_path, original_btxt_path, output_btxt_path):
    parsed = parse_btxt(original_btxt_path)
    
    with open(json_path, "r", encoding="utf8") as f:
        modifications = json.load(f)
    
    if len(modifications) != parsed.count:
        print(f"Warning: Count mismatch in JSON. Expected {parsed.count}, got {len(modifications)}")
    
    parsed.strings = [mod["string"] for mod in modifications]
    parsed.hashes = [mod["hash"] for mod in modifications]
    
    build_btxt(output_btxt_path, parsed)
    print(f"Rebuilt BTXT saved to {output_btxt_path}")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python btxt_parser.py extract <input.btxt> <output.json>")
        print("       python btxt_parser.py build <input.json> <original.btxt> <output.btxt>")
        sys.exit(1)
        
    cmd = sys.argv[1]
    if cmd == "extract":
        extract_to_json(sys.argv[2], sys.argv[3])
    elif cmd == "build":
        rebuild_from_json(sys.argv[2], sys.argv[3], sys.argv[4])

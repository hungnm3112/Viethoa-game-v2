import sys
import struct
import os

def scan_bmd(filepath):
    if not os.path.exists(filepath):
        print(f"File not found: {filepath}")
        return
        
    with open(filepath, "rb") as f:
        data = f.read()
    
    string_table_offset = struct.unpack_from("<I", data, 20)[0]
    string_table_size = struct.unpack_from("<I", data, 24)[0]
    
    # build valid starts
    valid_starts = set([0])
    for i in range(string_table_offset, string_table_offset + string_table_size):
        if data[i] == 0:
            valid_starts.add(i - string_table_offset + 1)
            
    # scan for 32-bit unaligned offsets
    hits = 0
    for i in range(28, string_table_offset - 3):
        v = struct.unpack_from("<I", data, i)[0]
        if v in valid_starts:
            hits += 1
            if hits < 10:
                end = data.find(b'\0', string_table_offset + v)
                s = data[string_table_offset + v : end]
                print(f"Hit at {i}: {v} -> {s}")
                
    print(f"Total 32-bit offset hits (unaligned): {hits}")

if __name__ == "__main__":
    if len(sys.argv) > 1:
        scan_bmd(sys.argv[1])
    else:
        print("Usage: python scan_bmd.py <file>")

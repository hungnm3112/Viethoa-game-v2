import sys
import json
import os
import argparse
from datetime import datetime, timezone
from btxt_parser import parse_btxt, build_btxt

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", default="config/btxt-expanded-pilot.json")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    
    with open(args.manifest, "r", encoding="utf8") as f:
        manifest = json.load(f)
        
    replacements = manifest.get("replacements", [])
    if not replacements:
        print("No replacements found in manifest.")
        return
        
    targets = [
        {"entryName": "languages/english.win.btxt", "entry": "input/gamedata/languages/english.win.btxt", "out": "output/gamedata/languages/english.win.btxt"},
        {"entryName": "languages/englishau.win.btxt", "entry": "input/gamedata/languages/englishau.win.btxt", "out": "output/gamedata/languages/englishau.win.btxt"}
    ]
    
    report_outputs = []
    
    for target in targets:
        if not os.path.exists(target["entry"]):
            print(f"Skipping {target['entry']} (not found in input directory)")
            continue
            
        parsed = parse_btxt(target["entry"])
        strings = list(parsed.strings)
        
        patched_count = 0
        missing_count = 0
        
        for rep in replacements:
            src = rep.get("sourceText", "")
            dst = rep.get("translatedText", "")
            if not dst:
                continue
                
            found = False
            for i in range(len(strings)):
                if strings[i] == src:
                    strings[i] = dst
                    patched_count += 1
                    found = True
                    # replaceAll is true by default
            if not found:
                missing_count += 1
                
        parsed.strings = strings
        
        if not args.dry_run:
            os.makedirs(os.path.dirname(target["out"]), exist_ok=True)
            build_btxt(target["out"], parsed)
            print(f"Wrote {target['out']}")
            
        print(f"{target['entryName']}: patched {patched_count}; missing {missing_count}")
        
        report_outputs.append({
            "entryName": target["entryName"],
            "outputFile": target["out"],
            "totals": {
                "candidates": len(replacements),
                "patched": patched_count,
                "missing": missing_count
            }
        })
        
    report = {
        "generatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "mode": "expanded-rebuild-python",
        "manifestFile": args.manifest,
        "dryRun": args.dry_run,
        "manifestDescription": manifest.get("description", ""),
        "outputs": report_outputs
    }
    
    report_file = "output/reports/build-btxt-expanded-report.json"
    os.makedirs(os.path.dirname(report_file), exist_ok=True)
    with open(report_file, "w", encoding="utf8") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)
        f.write("\n")
    print(f"Wrote {report_file}")

if __name__ == "__main__":
    main()

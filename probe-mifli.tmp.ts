import { hootBusName, hootCompliancy, hootPhoenixVersion, isHoot } from "./src/util/uploads/hoot";
import { parseHootFileName } from "./shared/logs/filenames";
for (const f of [
  "/home/filip/uploads/MIFLI_Q14_EE28C0214E37355320202036203011FF_2026-03-21_17-07-18.hoot",
  "/home/filip/uploads/MIFLI_Q14_rio_2026-03-21_17-07-18.hoot",
]) {
  const data = new Uint8Array(await Bun.file(f).arrayBuffer());
  const name = f.replace(/^.*\//, "");
  console.log(name);
  console.log("  size", (data.byteLength / 1e6).toFixed(2), "MB  isHoot(shape)", isHoot(data, "x.bin"),
    " bus", hootBusName(data), " phoenix", hootPhoenixVersion(data), " compliancy", hootCompliancy(data));
  console.log("  name says", JSON.stringify(parseHootFileName(name)));
}

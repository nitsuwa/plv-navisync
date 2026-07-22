import { readFileSync } from "fs";
import { globSync } from "glob";

const files = globSync("src/**/*.{ts,tsx}", { nodir: true });

let foundIssue = false;

for (const file of files) {
  const content = readFileSync(file, "utf-8");
  
  // Extract imported icon names from this file
  const importMatch = content.match(/import\s*\{([^}]+)\}\s*from\s+["']lucide-react["']/);
  if (!importMatch) continue;
  
  const importedNames = importMatch[1].split(",").map(n => {
    // Handle "as" aliases: "XIcon" -> use "XIcon", not "X"
    // Handle "Check as CheckIcon" -> use "CheckIcon"
    n = n.trim();
    const parts = n.split(/\s+as\s+/);
    return parts[parts.length - 1].trim();
  }).filter(Boolean);
  
  const importedSet = new Set(importedNames);
  
  // Find all PascalCase identifiers used in this file
  // that could be lucide icon references
  const pascalRefs = new Set();
  const pascalRegex = /(?<![A-Za-z0-9_$])[A-Z][a-z][A-Za-z0-9]*(?![A-Za-z0-9_$])/g;
  let m;
  while ((m = pascalRegex.exec(content)) !== null) {
    const word = m[0];
    // Skip known non-icon identifiers
    if (word.length < 2) continue;
    if (/^(React|Type|Props|State|Event|HTML|SVG|CSS|JSX|Node|Element|Component|Fragment|Children|Class|Style|Theme|Color|Size|Text|View|Key|Ref)$/.test(word)) continue;
    if (word.endsWith("Props") || word.endsWith("State") || word.endsWith("Event")) continue;
    pascalRefs.add(word);
  }
  
  // Check: are there icon names used in icon config objects (icon: IconName)?
  const iconRefs = new Set();
  const iconConfigRegex = /(?:icon|Icon)\s*:\s*([A-Z][a-zA-Z0-9]+)/g;
  while ((m = iconConfigRegex.exec(content)) !== null) {
    iconRefs.add(m[1]);
  }
  
  // Also check for icon names used as tags: <IconName
  const tagRegex = /<([A-Z][a-zA-Z0-9]+)(?:\s|>)/g;
  while ((m = tagRegex.exec(content)) !== null) {
    const tagName = m[1];
    // Skip HTML tags and React built-ins
    if (["div","span","p","a","h1","h2","h3","h4","h5","h6","ul","ol","li","table","tr","td","th","thead","tbody","input","button","select","option","form","label","textarea","img","svg","path","circle","rect","line","polygon","text","g","defs","linearGradient","stop","clipPath","mask","use","filter","feDropShadow","feGaussianBlur","feOffset","feMerge","feMergeNode","motion","AnimatePresence","Route","Routes","BrowserRouter","Outlet","Link","NavLink","Navigate","Fragment","Suspense","lazy","memo","forwardRef","useRef","useState","useEffect","useCallback","useMemo","useContext","useReducer","useLayoutEffect","useImperativeHandle","useDebugValue","useTransition","useDeferredValue","useSyncExternalStore","useId","use","createContext","createElement","cloneElement","isValidElement","Children","StrictMode","Profiler","createPortal","findDOMNode","flushSync","act","cache","createRef","createFactory","createRoot","hydrateRoot","renderToString","renderToStaticMarkup"].includes(tagName)) continue;
    tagRefs.add(tagName);
  }
  
  // The icons used in config objects are the most dangerous (like EyeOff)
  // because they don't cause compile errors
  const missingConfigIcons = [...iconRefs].filter(name => !importedSet.has(name) && name !== "Icon" && name !== "LucideIcon");
  
  if (missingConfigIcons.length > 0) {
    foundIssue = true;
    console.log(`❌ ${file}`);
    console.log(`   Config icon refs NOT imported: ${missingConfigIcons.join(", ")}`);
    console.log(`   Imported: [${importedNames.join(", ")}]`);
  }
}

if (!foundIssue) {
  console.log("✅ No missing icon imports found in config objects across all files.");
}

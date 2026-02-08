import {
  createSlot
} from "./chunk-SLMPVA66.js";
import {
  require_jsx_runtime
} from "./chunk-FYTI5SDZ.js";
import {
  require_react_dom
} from "./chunk-M67C5VP7.js";
import {
  require_react
} from "./chunk-7375RAIT.js";
import {
  __toESM
} from "./chunk-WOOG5QLI.js";

// ../../node_modules/.pnpm/@radix-ui+react-primitive@2.1.4_@types+react-dom@18.3.7_@types+react@18.3.28__@types+re_be93e2873c2be441aa6fe1469ec0005c/node_modules/@radix-ui/react-primitive/dist/index.mjs
var React = __toESM(require_react(), 1);
var ReactDOM = __toESM(require_react_dom(), 1);
var import_jsx_runtime = __toESM(require_jsx_runtime(), 1);
var NODES = [
  "a",
  "button",
  "div",
  "form",
  "h2",
  "h3",
  "img",
  "input",
  "label",
  "li",
  "nav",
  "ol",
  "p",
  "select",
  "span",
  "svg",
  "ul"
];
var Primitive = NODES.reduce((primitive, node) => {
  const Slot = createSlot(`Primitive.${node}`);
  const Node = React.forwardRef((props, forwardedRef) => {
    const { asChild, ...primitiveProps } = props;
    const Comp = asChild ? Slot : node;
    if (typeof window !== "undefined") {
      window[Symbol.for("radix-ui")] = true;
    }
    return (0, import_jsx_runtime.jsx)(Comp, { ...primitiveProps, ref: forwardedRef });
  });
  Node.displayName = `Primitive.${node}`;
  return { ...primitive, [node]: Node };
}, {});

export {
  Primitive
};
//# sourceMappingURL=chunk-FBFGIRK4.js.map

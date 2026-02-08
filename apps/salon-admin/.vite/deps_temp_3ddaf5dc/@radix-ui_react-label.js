"use client";
import {
  Primitive
} from "./chunk-FBFGIRK4.js";
import "./chunk-SLMPVA66.js";
import "./chunk-LQ2PGGTK.js";
import {
  require_jsx_runtime
} from "./chunk-FYTI5SDZ.js";
import "./chunk-M67C5VP7.js";
import {
  require_react
} from "./chunk-7375RAIT.js";
import {
  __toESM
} from "./chunk-WOOG5QLI.js";

// ../../node_modules/.pnpm/@radix-ui+react-label@2.1.8_@types+react-dom@18.3.7_@types+react@18.3.28__@types+react@_8915bfc4015ea7714adf8fc777d50ad8/node_modules/@radix-ui/react-label/dist/index.mjs
var React = __toESM(require_react(), 1);
var import_jsx_runtime = __toESM(require_jsx_runtime(), 1);
var NAME = "Label";
var Label = React.forwardRef((props, forwardedRef) => {
  return (0, import_jsx_runtime.jsx)(
    Primitive.label,
    {
      ...props,
      ref: forwardedRef,
      onMouseDown: (event) => {
        var _a;
        const target = event.target;
        if (target.closest("button, input, select, textarea")) return;
        (_a = props.onMouseDown) == null ? void 0 : _a.call(props, event);
        if (!event.defaultPrevented && event.detail > 1) event.preventDefault();
      }
    }
  );
});
Label.displayName = NAME;
var Root = Label;
export {
  Label,
  Root
};
//# sourceMappingURL=@radix-ui_react-label.js.map

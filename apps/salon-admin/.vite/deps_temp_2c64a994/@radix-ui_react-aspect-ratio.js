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

// ../../node_modules/.pnpm/@radix-ui+react-aspect-ratio@1.1.8_@types+react-dom@18.3.7_@types+react@18.3.28__@types_2f2aead29b24d771b5ba9bfdac90109f/node_modules/@radix-ui/react-aspect-ratio/dist/index.mjs
var React = __toESM(require_react(), 1);
var import_jsx_runtime = __toESM(require_jsx_runtime(), 1);
var NAME = "AspectRatio";
var AspectRatio = React.forwardRef(
  (props, forwardedRef) => {
    const { ratio = 1 / 1, style, ...aspectRatioProps } = props;
    return (0, import_jsx_runtime.jsx)(
      "div",
      {
        style: {
          // ensures inner element is contained
          position: "relative",
          // ensures padding bottom trick maths works
          width: "100%",
          paddingBottom: `${100 / ratio}%`
        },
        "data-radix-aspect-ratio-wrapper": "",
        children: (0, import_jsx_runtime.jsx)(
          Primitive.div,
          {
            ...aspectRatioProps,
            ref: forwardedRef,
            style: {
              ...style,
              // ensures children expand in ratio
              position: "absolute",
              top: 0,
              right: 0,
              bottom: 0,
              left: 0
            }
          }
        )
      }
    );
  }
);
AspectRatio.displayName = NAME;
var Root = AspectRatio;
export {
  AspectRatio,
  Root
};
//# sourceMappingURL=@radix-ui_react-aspect-ratio.js.map

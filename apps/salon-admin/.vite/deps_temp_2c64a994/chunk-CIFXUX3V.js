import {
  require_react
} from "./chunk-7375RAIT.js";
import {
  __toESM
} from "./chunk-WOOG5QLI.js";

// ../../node_modules/.pnpm/@radix-ui+react-use-callback-ref@1.1.1_@types+react@18.3.28_react@18.3.1/node_modules/@radix-ui/react-use-callback-ref/dist/index.mjs
var React = __toESM(require_react(), 1);
function useCallbackRef(callback) {
  const callbackRef = React.useRef(callback);
  React.useEffect(() => {
    callbackRef.current = callback;
  });
  return React.useMemo(() => (...args) => {
    var _a;
    return (_a = callbackRef.current) == null ? void 0 : _a.call(callbackRef, ...args);
  }, []);
}

export {
  useCallbackRef
};
//# sourceMappingURL=chunk-CIFXUX3V.js.map

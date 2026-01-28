import { action } from "webextension-polyfill";

export function updateIcon(devMode: boolean) {
  const color = devMode ? "purple" : "black";
  action.setIcon({
    path: {
      16: `/icons/ethui-${color}-16.png`,
      48: `/icons/ethui-${color}-48.png`,
      96: `/icons/ethui-${color}-96.png`,
      128: `/icons/ethui-${color}-128.png`,
    },
  });
}

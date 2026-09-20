export function closeOverflowMenuOnOutsideClick(menu, target) {
  if (!menu?.open || menu.contains(target)) return false;
  menu.open = false;
  return true;
}

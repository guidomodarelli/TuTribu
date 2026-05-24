export function reloadCurrentPage(): void {
  window.location.reload();
}

export function navigateToUrl(url: string): void {
  window.location.href = url;
}

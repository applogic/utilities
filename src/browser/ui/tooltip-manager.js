import { computePosition, flip, shift, offset, arrow } from "@floating-ui/dom";

const tooltips = new Map();

/**
 * Creates and attaches a Floating UI tooltip to an element
 * @param {HTMLElement} element - The element to attach tooltip to
 * @param {string} content - The tooltip content
 * @param {Object} options - Configuration options
 */
export function attachTooltip(element, content, options = {}) {
  if (!element || !content) return;

  const tooltipId = `tooltip-${Math.random().toString(36).substr(2, 9)}`;

  const tooltip = document.createElement("div");
  tooltip.className = "floating-tooltip";
  tooltip.id = tooltipId;
  tooltip.innerHTML = content;
  tooltip.setAttribute("role", "tooltip");

  const arrowElement = document.createElement("div");
  arrowElement.className = "floating-tooltip-arrow";
  tooltip.appendChild(arrowElement);

  document.body.appendChild(tooltip);

  const placement = options.placement || "top";

  async function updatePosition() {
    const { x, y, placement: finalPlacement, middlewareData } = await computePosition(element, tooltip, {
      placement,
      middleware: [
        offset(8),
        flip(),
        shift({ padding: 5 }),
        arrow({ element: arrowElement })
      ]
    });

    Object.assign(tooltip.style, {
      left: `${x}px`,
      top: `${y}px`
    });

    if (middlewareData.arrow) {
      const { x: arrowX, y: arrowY } = middlewareData.arrow;
      const staticSide = {
        top: "bottom",
        right: "left",
        bottom: "top",
        left: "right"
      }[finalPlacement.split("-")[0]];

      Object.assign(arrowElement.style, {
        left: arrowX != null ? `${arrowX}px` : "",
        top: arrowY != null ? `${arrowY}px` : "",
        right: "",
        bottom: "",
        [staticSide]: "-4px"
      });
    }
  }

  function showTooltip() {
    tooltip.style.display = "block";
    updatePosition();
  }

  function hideTooltip() {
    tooltip.style.display = "";
  }

  element.addEventListener("mouseenter", showTooltip);
  element.addEventListener("mouseleave", hideTooltip);
  element.addEventListener("focus", showTooltip);
  element.addEventListener("blur", hideTooltip);

  tooltips.set(element, {
    tooltipElement: tooltip,
    arrowElement,
    showTooltip,
    hideTooltip,
    updatePosition,
    cleanup: () => {
      element.removeEventListener("mouseenter", showTooltip);
      element.removeEventListener("mouseleave", hideTooltip);
      element.removeEventListener("focus", showTooltip);
      element.removeEventListener("blur", hideTooltip);
      tooltip.remove();
      tooltips.delete(element);
    }
  });

  return tooltipId;
}

/**
 * Updates the content of an existing tooltip
 * @param {HTMLElement} element - The element with the tooltip
 * @param {string} newContent - The new tooltip content
 */
export function updateTooltipContent(element, newContent) {
  const tooltipData = tooltips.get(element);
  if (!tooltipData) return;

  const wasVisible = tooltipData.tooltipElement.style.display === 'block';

  // Clear existing content (except arrow)
  Array.from(tooltipData.tooltipElement.childNodes).forEach(node => {
    if (node !== tooltipData.arrowElement) {
      node.remove();
    }
  });

  // Insert new HTML content before arrow
  const temp = document.createElement('div');
  temp.innerHTML = newContent;

  while (temp.firstChild) {
    tooltipData.tooltipElement.insertBefore(temp.firstChild, tooltipData.arrowElement);
  }

  // Restore visibility and update position
  if (wasVisible) {
    tooltipData.tooltipElement.style.display = 'block';
    tooltipData.updatePosition();
  }
}

/**
 * Removes a tooltip from an element
 * @param {HTMLElement} element - The element to remove tooltip from
 */
export function removeTooltip(element) {
  const tooltipData = tooltips.get(element);
  if (tooltipData) {
    tooltipData.cleanup();
  }
}

/**
 * Checks if an element has a tooltip attached
 * @param {HTMLElement} element - The element to check
 * @returns {boolean}
 */
export function hasTooltip(element) {
  return tooltips.has(element);
}

/**
 * Removes all tooltips
 */
export function removeAllTooltips() {
  tooltips.forEach((data) => data.cleanup());
  tooltips.clear();
}

/**
 * Check if tooltip is currently visible
 */
export function isTooltipVisible(element) {
  const tooltipData = tooltips.get(element);
  if (!tooltipData) return false;
  return tooltipData.tooltipElement.style.display === 'block';
}

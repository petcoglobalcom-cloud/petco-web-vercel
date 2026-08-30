(function () {
  "use strict";

  /* ---------------------------------------------------------------------
     0. Facebook Pixel helper (event_id dùng để dedupe Pixel <-> CAPI)
     --------------------------------------------------------------------- */
  function pcgGenEventId() {
    return "pcg_" + Date.now() + "_" + Math.random().toString(36).substring(2, 11);
  }
  window.pcgGenEventId = window.pcgGenEventId || pcgGenEventId;

  function fbTrack(name, params, presetEventId) {
    var eventId = presetEventId || pcgGenEventId();
    if (typeof fbq === "function") {
      fbq("track", name, params || {}, { eventID: eventId });
    }
    return eventId;
  }

  function pcgGetCookie(name) {
    var m = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
    return m ? decodeURIComponent(m[1]) : "";
  }

  var PCG_PIXEL_ID = "1578288173962336";

  function pcgNormalizePhone(raw) {
    if (!raw) return "";
    var digits = String(raw).replace(/[^\d]/g, "");
    if (digits.charAt(0) === "0") digits = "84" + digits.substring(1);
    return digits;
  }

  function pcgNormalizeEmail(raw) {
    return raw ? String(raw).trim().toLowerCase() : "";
  }

  function pcgUpdateAdvancedMatching(nameVal, phoneVal, emailVal) {
    if (typeof fbq !== "function") return;
    var matchData = {};
    var ph = pcgNormalizePhone(phoneVal);
    var em = pcgNormalizeEmail(emailVal);
    var fn = nameVal ? String(nameVal).trim().split(/\s+/)[0].toLowerCase() : "";
    if (ph) matchData.ph = ph;
    if (em) matchData.em = em;
    if (fn) matchData.fn = fn;
    if (Object.keys(matchData).length) {
      fbq("init", PCG_PIXEL_ID, matchData);
    }
  }

  /* ---------------------------------------------------------------------
     1. Data: bảng giá theo variant + SKU tra cứu sang Supabase
     --------------------------------------------------------------------- */
  var VARIANTS = {
    "variant-m-single": { name: "Bát Đơn Size M", price: 179000, sku: "PCG-BAT-M-SINGLE" },
    "variant-l-single": { name: "Bát Đơn Size L", price: 199000, sku: "PCG-BAT-L-SINGLE" },
    "variant-m-tilt": { name: "Bát Đôi Nghiêng Size M", price: 289000, sku: "PCG-BAT-M-TILT" },
    "variant-m-double": { name: "Bát Đôi Size M", price: 299000, sku: "PCG-BAT-M-DOUBLE" },
    "variant-l-double": { name: "Bát Đôi Size L", price: 335000, sku: "PCG-BAT-L-DOUBLE" },
    "variant-xl-double": { name: "Bát Đôi Size XL", price: 389000, sku: "PCG-BAT-XL-DOUBLE" },
    "variant-meo-don-nghieng": { name: "Bát Đơn Nghiêng Size M", price: 179000, sku: "PCG-MEO-DON-NGHIENG" },
    "variant-meo-doi-nghieng": { name: "Bát Đôi Nghiêng Size M", price: 289000, sku: "PCG-MEO-DOI-NGHIENG" },
    "variant-harmony-single": { name: "Nhà Harmony (kèm đệm)", price: 635000, sku: "harmony-house" },
    "variant-harmony-combo": { name: "Combo: Nhà Harmony + Bát Đôi Nghiêng", price: 779000, sku: "harmony-combo-bat-doi-nghieng" }
  };

  // Tra sku -> variant_id thật trong Supabase (bảng product_variants).
  // Cập nhật object này nếu sau này thêm/xóa biến thể trong Admin Dashboard.
  var PCG_VARIANT_ID_MAP = {
    "PCG-BAT-M-SINGLE": "84957dd4-f94b-401c-84b8-6a238b37c008",
    "PCG-BAT-L-SINGLE": "d1786f9c-6ad6-4db2-b570-91e2f14350b3",
    "PCG-BAT-M-TILT": "b556b895-38e7-46fb-bd34-e0032f2f38d4",
    "PCG-BAT-M-DOUBLE": "bda7da49-cc8d-4c3f-8405-dd703a59e196",
    "PCG-BAT-L-DOUBLE": "51905e7e-d85e-40b8-b57f-3964fe720377",
    "PCG-BAT-XL-DOUBLE": "959b8bcd-93bf-4375-bda1-4238de4636b6",
    "PCG-MEO-DON-NGHIENG": "2f0a5140-47d7-46be-b972-5f234e43f17b",
    "PCG-MEO-DOI-NGHIENG": "466aa68d-df92-4bb7-91a9-24e63a7f7e2e",
    "catlotus-house": "f6689a27-f438-4223-ba39-942f392acfce",
    "catlotus-scratcher": "02f3a86a-6aa0-407b-98f0-5640c346c70a",
    "catmaru-hammock": "14e7836e-3303-43b1-8b97-beb09e39f554",
    "harmony-house": "c4605a3a-0d38-4333-bf1f-c94510f7de92",
    "harmony-combo-bat-doi-nghieng": "d9ddc3b2-1236-406b-94ca-e88e67f75a1a"
    // "PCG-BAT-001" và "pet-clothes": CHƯA có sản phẩm thật trong Supabase — xem README tích hợp
  };

  function formatVND(n) {
    return n.toLocaleString("vi-VN") + "đ";
  }

  /* ---------------------------------------------------------------------
     2. Gallery: thumbnail / dots / prev-next đồng bộ ảnh chính
     --------------------------------------------------------------------- */
  (function initGallery() {
    var mainImg = document.getElementById("main-product-image");
    var thumbs = Array.prototype.slice.call(document.querySelectorAll("#thumbnail-row .thumb"));
    var dots = Array.prototype.slice.call(document.querySelectorAll("#gallery-dots .dot"));
    var prevBtn = document.getElementById("gallery-prev");
    var nextBtn = document.getElementById("gallery-next");
    if (!mainImg || !thumbs.length) return;

    var images = thumbs.map(function (t) {
      var img = t.querySelector("img");
      return { src: img.dataset.full || img.src, alt: img.alt };
    });

    var current = Math.max(
      0,
      dots.findIndex(function (d) { return d.classList.contains("is-active"); })
    );

    function render() {
      var data = images[current];
      mainImg.src = data.src;
      mainImg.alt = data.alt;
      thumbs.forEach(function (t, i) { t.classList.toggle("is-active", i === current); });
      dots.forEach(function (d, i) { d.classList.toggle("is-active", i === current); });
    }

    thumbs.forEach(function (t, i) {
      t.addEventListener("click", function () { current = i; render(); });
    });
    dots.forEach(function (d, i) {
      d.addEventListener("click", function () { current = i; render(); });
    });
    if (prevBtn) prevBtn.addEventListener("click", function () {
      current = (current - 1 + images.length) % images.length;
      render();
    });
    if (nextBtn) nextBtn.addEventListener("click", function () {
      current = (current + 1) % images.length;
      render();
    });

    render();
  })();

  /* ---------------------------------------------------------------------
     3. Buy-box variant cards: cho phép chọn NHIỀU biến thể, đồng bộ 2 chiều
        với checkbox trong modal thanh toán (nơi khách chỉnh số lượng)
     --------------------------------------------------------------------- */
  (function initVariantGrid() {
    var grid = document.getElementById("variant-grid");
    if (!grid) return;
    var cards = Array.prototype.slice.call(grid.querySelectorAll(".variant-card"));

    function syncCardState(card) {
      var key = card.dataset.variant;
      var checkbox = document.getElementById(key);
      card.classList.toggle("is-active", !!(checkbox && checkbox.checked));
    }

    cards.forEach(function (card) {
      card.addEventListener("click", function () {
        var key = card.dataset.variant;
        var checkbox = document.getElementById(key);
        if (!checkbox) return;
        checkbox.checked = !checkbox.checked;
        syncCardState(card);
        recomputeCart();
      });
      syncCardState(card);
    });

    window.pcgSyncVariantCards = function () {
      cards.forEach(syncCardState);
    };
  })();

  /* ---------------------------------------------------------------------
     4. Countdown "ưu đãi sắp hết hạn"
     --------------------------------------------------------------------- */
  (function initCountdown() {
    var el = document.getElementById("countdown-timer");
    if (!el) return;
    var totalSeconds = 11 * 3600 + 55 * 60 + 35;

    function tick() {
      totalSeconds -= 1;
      if (totalSeconds <= 0) totalSeconds = 11 * 3600 + 55 * 60 + 35;
      var h = Math.floor(totalSeconds / 3600);
      var m = Math.floor((totalSeconds % 3600) / 60);
      var s = totalSeconds % 60;
      function pad(n) { return String(n).padStart(2, "0"); }
      el.textContent = pad(h) + ":" + pad(m) + ":" + pad(s);
    }
    setInterval(tick, 1000);
  })();

  /* ---------------------------------------------------------------------
     5. Social-proof counters
     --------------------------------------------------------------------- */
  (function initLiveCounters() {
    var viewersEl = document.getElementById("live-viewers-count");
    var ordersEl = document.getElementById("weekly-orders-count");
    if (viewersEl) {
      setInterval(function () {
        var base = parseInt(viewersEl.textContent, 10) || 48;
        var delta = Math.floor(Math.random() * 5) - 2;
        var next = Math.min(89, Math.max(31, base + delta));
        viewersEl.textContent = next;
      }, 4500);
    }
    if (ordersEl) {
      setInterval(function () {
        var base = parseInt(ordersEl.textContent, 10) || 287;
        ordersEl.textContent = base + (Math.random() < 0.5 ? 0 : 1);
      }, 9000);
    }
  })();

  /* ---------------------------------------------------------------------
     6. Estimated delivery date
     --------------------------------------------------------------------- */
  (function initDeliveryEstimate() {
    var el = document.getElementById("estimated-delivery");
    if (!el) return;
    var now = new Date();
    var from = new Date(now); from.setDate(now.getDate() + 2);
    var to = new Date(now); to.setDate(now.getDate() + 5);
    function fmt(d) { return d.getDate() + "/" + (d.getMonth() + 1); }
    el.textContent = "Dự kiến giao hàng: " + fmt(from) + " - " + fmt(to);
  })();

  /* ---------------------------------------------------------------------
     7. Checkout modal: mở / đóng + InitiateCheckout
     --------------------------------------------------------------------- */
  var modal = document.getElementById("checkout-modal");
  var nameInput = document.getElementById("customer-name");
  var phoneInput = document.getElementById("customer-phone");
  var addressInput = document.getElementById("customer-address");
  var errorEl = document.getElementById("order-error");
  var emailInputEarly = document.getElementById("customer-email");

  [nameInput, phoneInput, emailInputEarly].forEach(function (el) {
    if (!el) return;
    el.addEventListener("blur", function () {
      pcgUpdateAdvancedMatching(
        nameInput.value.trim(),
        phoneInput.value.trim(),
        emailInputEarly ? emailInputEarly.value.trim() : ""
      );
    });
  });

  var currentSingleProduct = null;

  function activateSingleProductMode(id, name, price) {
    currentSingleProduct = { id: id, name: name, price: price };
    var multiList = document.getElementById("cart-list");
    var singleList = document.getElementById("single-product-list");
    var promoNote = document.querySelector(".promo-note");
    if (multiList) multiList.hidden = true;
    if (singleList) singleList.hidden = false;
    if (promoNote) promoNote.hidden = true;

    var labelEl = document.getElementById("single-product-label");
    var priceEl = document.getElementById("single-product-price-label");
    var qtyEl = document.getElementById("single-product-qty-input");
    if (labelEl) labelEl.textContent = name;
    if (priceEl) priceEl.textContent = formatVND(price);
    if (qtyEl) qtyEl.value = "1";
  }

  function activateMultiProductMode() {
    currentSingleProduct = null;
    var multiList = document.getElementById("cart-list");
    var singleList = document.getElementById("single-product-list");
    var promoNote = document.querySelector(".promo-note");
    if (multiList) multiList.hidden = false;
    if (singleList) singleList.hidden = true;
    if (promoNote) promoNote.hidden = false;
  }

  function openModal(e) {
    if (e) e.preventDefault();
    if (!modal) return;

    var trigger = e && e.currentTarget;
    var productId = trigger && trigger.dataset ? trigger.dataset.productId : null;

    if (productId) {
      activateSingleProductMode(productId, trigger.dataset.productName, parseInt(trigger.dataset.productPrice, 10) || 0);
    } else {
      activateMultiProductMode();
    }
    recomputeCart();

    modal.hidden = false;
    void modal.offsetHeight;
    modal.classList.add("active");
    document.body.style.overflow = "hidden";

    var currentTotalEl = document.getElementById("selection-total");
    var currentTotalValue = currentTotalEl
      ? parseInt(currentTotalEl.textContent.replace(/[^\d]/g, ""), 10) || 0
      : 0;

    var initCheckoutEventId = fbTrack("InitiateCheckout", {
      content_name: currentSingleProduct ? currentSingleProduct.name : "Bát ăn cho chó inox Petco Global",
      content_ids: [currentSingleProduct ? currentSingleProduct.id : "PCG-BAT-001"],
      content_type: "product",
      currency: "VND",
      value: currentTotalValue
    });
    window.pcgLastInitCheckoutEventId = initCheckoutEventId;
  }

  function closeModal() {
    if (!modal) return;
    modal.classList.remove("active");
    document.body.style.overflow = "";
    setTimeout(function () { modal.hidden = true; }, 220);
  }

  document.getElementById("open-checkout-btn") && document.getElementById("open-checkout-btn").addEventListener("click", openModal);
  Array.prototype.slice.call(document.querySelectorAll(".js-open-checkout")).forEach(function (btn) {
    btn.addEventListener("click", openModal);
  });
  document.getElementById("close-modal") && document.getElementById("close-modal").addEventListener("click", closeModal);
  document.getElementById("modal-backdrop") && document.getElementById("modal-backdrop").addEventListener("click", closeModal);
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && modal && !modal.hidden) closeModal();
  });

  /* ---------------------------------------------------------------------
     8. Giỏ hàng trong modal: checkbox + số lượng + giảm giá 10% từ 2 SP
     --------------------------------------------------------------------- */
  function recomputeCart() {
    if (currentSingleProduct) {
      var spQtyEl = document.getElementById("single-product-qty-input");
      var spQty = spQtyEl ? (parseInt(spQtyEl.value, 10) || 1) : 1;
      var spSubtotal = currentSingleProduct.price * spQty;
      var spDiscountPct = spQty >= 2 ? 10 : 0;
      var spDiscountAmount = Math.round((spSubtotal * spDiscountPct) / 100);
      var spTotal = spSubtotal - spDiscountAmount;

      var spTotalLabelEl = document.getElementById("single-product-total-label");
      var spDiscountNoteEl = document.getElementById("single-product-discount-note");
      if (spTotalLabelEl) spTotalLabelEl.textContent = formatVND(spTotal);
      if (spDiscountNoteEl) {
        spDiscountNoteEl.textContent = spDiscountPct > 0
          ? "Đã áp dụng giảm 10% cho " + spQty + " sản phẩm"
          : "Mua từ 2 sản phẩm để được giảm 10%";
      }

      var spOrderSubtotalEl = document.getElementById("order-subtotal");
      var spOrderDiscountLabelEl = document.getElementById("order-discount-label");
      var spOrderDiscountAmountEl = document.getElementById("order-discount-amount");
      var spOrderTotalEl = document.getElementById("order-total");
      if (spOrderSubtotalEl) spOrderSubtotalEl.textContent = formatVND(spSubtotal);
      if (spOrderDiscountLabelEl) spOrderDiscountLabelEl.textContent = "Giảm giá (" + spDiscountPct + "%)";
      if (spOrderDiscountAmountEl) spOrderDiscountAmountEl.textContent = spDiscountPct > 0 ? "-" + formatVND(spDiscountAmount) : "0đ";
      if (spOrderTotalEl) spOrderTotalEl.textContent = formatVND(spTotal);

      return { subtotal: spSubtotal, discountAmount: spDiscountAmount, total: spTotal, distinctSelected: 1 };
    }

    var subtotal = 0;
    var distinctSelected = 0;
    var totalQty = 0;

    Object.keys(VARIANTS).forEach(function (key) {
      var checkbox = document.getElementById(key);
      var row = checkbox ? checkbox.closest(".cart-row") : null;
      if (!checkbox) return;
      var qtyInput = row ? row.querySelector('[data-qty-control="' + key + '"] input') : null;
      var qty = qtyInput ? parseInt(qtyInput.value, 10) || 1 : 1;

      if (row) row.classList.toggle("is-active", checkbox.checked);
      if (checkbox.checked) {
        distinctSelected += 1;
        totalQty += qty;
        subtotal += VARIANTS[key].price * qty;
      }
    });

    var discountPct = totalQty >= 2 ? 10 : 0;
    var discountAmount = Math.round((subtotal * discountPct) / 100);
    var total = subtotal - discountAmount;

    var selectionTotalEl = document.getElementById("selection-total");
    var discountNoteEl = document.getElementById("selection-discount-note");
    if (selectionTotalEl) selectionTotalEl.textContent = formatVND(total);
    if (discountNoteEl) {
      discountNoteEl.textContent = discountPct > 0
        ? "Đã áp dụng giảm 10% cho " + totalQty + " sản phẩm"
        : "Chọn thêm sản phẩm để được giảm 10%";
    }

    var orderSubtotalEl = document.getElementById("order-subtotal");
    var orderDiscountLabelEl = document.getElementById("order-discount-label");
    var orderDiscountAmountEl = document.getElementById("order-discount-amount");
    var orderTotalEl = document.getElementById("order-total");
    if (orderSubtotalEl) orderSubtotalEl.textContent = formatVND(subtotal);
    if (orderDiscountLabelEl) orderDiscountLabelEl.textContent = "Giảm giá (" + discountPct + "%)";
    if (orderDiscountAmountEl) orderDiscountAmountEl.textContent = discountPct > 0 ? "-" + formatVND(discountAmount) : "0đ";
    if (orderTotalEl) orderTotalEl.textContent = formatVND(total);

    if (window.pcgSyncVariantCards) window.pcgSyncVariantCards();

    return { subtotal: subtotal, discountAmount: discountAmount, total: total, distinctSelected: distinctSelected };
  }

  Object.keys(VARIANTS).forEach(function (key) {
    var checkbox = document.getElementById(key);
    if (checkbox) checkbox.addEventListener("change", recomputeCart);
  });

  Array.prototype.slice.call(document.querySelectorAll(".qty")).forEach(function (qtyEl) {
    var key = qtyEl.dataset.qtyControl;
    var input = qtyEl.querySelector("input");
    var buttons = qtyEl.querySelectorAll("button");
    if (buttons.length < 2 || !input) return;
    buttons[0].addEventListener("click", function () {
      input.value = Math.max(1, (parseInt(input.value, 10) || 1) - 1);
      if (key === "single-product") { recomputeCart(); return; }
      var checkbox = document.getElementById(key);
      if (checkbox && checkbox.checked) recomputeCart();
    });
    buttons[1].addEventListener("click", function () {
      input.value = Math.min(20, (parseInt(input.value, 10) || 1) + 1);
      if (key === "single-product") { recomputeCart(); return; }
      var checkbox = document.getElementById(key);
      if (checkbox && checkbox.checked) recomputeCart();
    });
  });

  recomputeCart();

  /* ---------------------------------------------------------------------
     9. Phương thức thanh toán: COD / Chuyển khoản
     --------------------------------------------------------------------- */
  (function initPaymentOptions() {
    var codRadio = document.getElementById("payment-cod");
    var transferRadio = document.getElementById("payment-transfer");
    var bankInfo = document.getElementById("bank-transfer-info");
    var transferContentValue = document.getElementById("transfer-content-value");

    function updateOptionStyles() {
      Array.prototype.slice.call(document.querySelectorAll(".pay-option")).forEach(function (label) {
        var radio = label.querySelector("input[type=radio]");
        label.classList.toggle("is-active", !!(radio && radio.checked));
      });
    }

    function toggleBankInfo() {
      if (!bankInfo) return;
      bankInfo.hidden = !(transferRadio && transferRadio.checked);
      if (transferContentValue) {
        var n = nameInput && nameInput.value.trim();
        var p = phoneInput && phoneInput.value.trim();
        transferContentValue.textContent = (n || p) ? [n, p].filter(Boolean).join(" ") : "Tên + Số điện thoại";
      }
      updateOptionStyles();
    }

    if (codRadio) codRadio.addEventListener("change", toggleBankInfo);
    if (transferRadio) transferRadio.addEventListener("change", toggleBankInfo);
    if (nameInput) nameInput.addEventListener("input", toggleBankInfo);
    if (phoneInput) phoneInput.addEventListener("input", toggleBankInfo);
    toggleBankInfo();
  })();

  /* ---------------------------------------------------------------------
     10. Chọn sản phẩm đã tick (dùng cho cả Apps Script + Supabase)
     --------------------------------------------------------------------- */
  function pcgGetSelectedItems() {
    if (currentSingleProduct) {
      var spQtyInput = document.getElementById("single-product-qty-input");
      var spQty = spQtyInput ? (parseInt(spQtyInput.value, 10) || 1) : 1;
      var spVariantId = PCG_VARIANT_ID_MAP[currentSingleProduct.id];
      return {
        list: [currentSingleProduct.name + " x" + spQty],
        totalQty: spQty,
        supabaseItems: spVariantId ? [{ variant_id: spVariantId, quantity: spQty }] : []
      };
    }

    var items = [];
    var supabaseItems = [];
    var totalQty = 0;
    Array.prototype.slice.call(document.querySelectorAll("#cart-list .cart-row")).forEach(function (row) {
      var checkbox = row.querySelector('input[type="checkbox"]');
      if (checkbox && checkbox.checked) {
        var label = row.querySelector("label");
        var qtyInput = row.querySelector(".qty input");
        var qty = qtyInput ? (parseInt(qtyInput.value, 10) || 1) : 1;
        items.push((label ? label.textContent.trim() : checkbox.id) + " x" + qty);
        totalQty += qty;

        var variantDef = VARIANTS[checkbox.id];
        var variantId = variantDef ? PCG_VARIANT_ID_MAP[variantDef.sku] : null;
        if (variantId) supabaseItems.push({ variant_id: variantId, quantity: qty });
      }
    });
    return { list: items, totalQty: totalQty, supabaseItems: supabaseItems };
  }

  /* ---------------------------------------------------------------------
     11. Gọi Supabase place_order — nguồn dữ liệu chính thức, cộng điểm ngay
     --------------------------------------------------------------------- */
  function pcgPlaceOrderSupabase(payload) {
    var url = (window.PCG_SUPABASE_URL || "") + "/rest/v1/rpc/place_order";
    return fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": window.PCG_SUPABASE_ANON_KEY || "",
        "Authorization": "Bearer " + (window.PCG_SUPABASE_ANON_KEY || "")
      },
      body: JSON.stringify(payload)
    }).then(function (res) {
      if (!res.ok) {
        return res.json().then(function (err) {
          throw new Error((err && (err.message || err.hint)) || "Không đặt được đơn hàng");
        });
      }
      return res.json();
    });
  }

  function pcgGetUtmParam(name) {
    try {
      return new URLSearchParams(window.location.search).get(name) || null;
    } catch (e) {
      return null;
    }
  }

  /* ---------------------------------------------------------------------
     12. Xác nhận đặt hàng: validate -> Supabase place_order -> Thank you
         (Google Sheet/Apps Script chạy song song, không chặn nếu lỗi)
     --------------------------------------------------------------------- */
  var confirmBtn = document.getElementById("confirm-order-btn");

  confirmBtn && confirmBtn.addEventListener("click", function () {
    var valid = nameInput && nameInput.value.trim() && phoneInput && phoneInput.value.trim() && addressInput && addressInput.value.trim();
    if (!valid) {
      if (errorEl) errorEl.hidden = false;
      return;
    }
    if (errorEl) errorEl.hidden = true;

    var cart = recomputeCart();
    var emailInput = document.getElementById("customer-email");
    var isTransfer = document.getElementById("payment-transfer") && document.getElementById("payment-transfer").checked;
    var selected = pcgGetSelectedItems();

    if (!selected.supabaseItems || !selected.supabaseItems.length) {
      if (errorEl) {
        errorEl.hidden = false;
        errorEl.textContent = "Vui lòng chọn ít nhất 1 sản phẩm hợp lệ.";
      }
      return;
    }

    confirmBtn.disabled = true;
    var originalLabel = confirmBtn.textContent;
    confirmBtn.textContent = "Đang xử lý...";

    var orderEventId = pcgGenEventId();

    pcgPlaceOrderSupabase({
      p_customer_name: nameInput.value.trim(),
      p_customer_phone: phoneInput.value.trim(),
      p_customer_address: addressInput.value.trim(),
      p_items: selected.supabaseItems,
      p_payment_method: isTransfer ? "transfer" : "cod",
      p_shipping_fee: 0,
      p_note: emailInput && emailInput.value.trim() ? "Email: " + emailInput.value.trim() : null,
      p_utm_source: pcgGetUtmParam("utm_source"),
      p_utm_campaign: pcgGetUtmParam("utm_campaign")
    })
      .then(function (result) {
        var data = Array.isArray(result) ? result[0] : result;

        pcgUpdateAdvancedMatching(
          nameInput.value.trim(),
          phoneInput.value.trim(),
          emailInput ? emailInput.value.trim() : ""
        );

        fbTrack("Purchase", {
          content_name: currentSingleProduct ? currentSingleProduct.name : "Bát ăn cho chó inox Petco Global",
          content_ids: [currentSingleProduct ? currentSingleProduct.id : "PCG-BAT-001"],
          content_type: "product",
          currency: "VND",
          value: data.total,
          order_id: data.order_code
        }, orderEventId);

        window.pcgLastOrderCode = "#" + data.order_code;
        window.pcgLastOrderTotal = data.total;
        window.pcgLastPointsEarned = data.points_earned;
        window.pcgLastNewTier = data.new_tier;

        var appsScriptUrl = window.PCG_APPS_SCRIPT_URL || "";
        if (appsScriptUrl.indexOf("http") === 0) {
          fetch(appsScriptUrl, {
            method: "POST",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify({
              hoTen: nameInput.value.trim(),
              soDienThoai: phoneInput.value.trim(),
              email: emailInput ? emailInput.value.trim() : "",
              diaChi: addressInput.value.trim(),
              sanPham: selected.list.join(", "),
              soLuong: selected.totalQty,
              tongTien: data.total.toLocaleString("vi-VN") + "đ",
              thanhToan: isTransfer ? "Chuyển khoản" : "COD",
              eventId: orderEventId,
              userAgent: navigator.userAgent,
              fbp: pcgGetCookie("_fbp"),
              fbc: pcgGetCookie("_fbc"),
              maDonSupabase: data.order_code
            })
          }).catch(function (err) {
            console.error("Ghi Google Sheet thất bại (không ảnh hưởng đơn hàng chính):", err);
          });
        }

        closeModal();
        setTimeout(openThankYou, 320);
      })
      .catch(function (err) {
        console.error("Không đặt được đơn hàng qua Supabase:", err);
        if (errorEl) {
          errorEl.hidden = false;
          errorEl.textContent = "Không thể đặt hàng: " + err.message + ". Vui lòng thử lại hoặc gọi hotline.";
        }
      })
      .finally(function () {
        confirmBtn.disabled = false;
        confirmBtn.textContent = originalLabel;
      });
  });

  /* ---------------------------------------------------------------------
     13. Popup cảm ơn
     --------------------------------------------------------------------- */
  var thankyouModal = document.getElementById("thankyou-modal");

  function openThankYou() {
    var isTransfer = document.getElementById("payment-transfer") && document.getElementById("payment-transfer").checked;
    var total = document.getElementById("order-total") ? document.getElementById("order-total").textContent : "0đ";

    var nameEl = document.getElementById("thankyou-name");
    var phoneEl = document.getElementById("thankyou-phone");
    var totalEl = document.getElementById("thankyou-total");
    var totalLabelEl = document.getElementById("thankyou-total-label");
    var codeEl = document.getElementById("thankyou-order-code");
    var bankInfoEl = document.getElementById("thankyou-bank-info");
    var transferContentEl = document.getElementById("thankyou-transfer-content");

    if (nameEl) nameEl.textContent = (nameInput && nameInput.value.trim()) || "bạn";
    if (phoneEl) phoneEl.textContent = (phoneInput && phoneInput.value.trim()) || "";
    if (totalEl) totalEl.textContent = total;
    if (totalLabelEl) totalLabelEl.textContent = isTransfer ? "Tổng cần chuyển khoản" : "Tổng thanh toán (COD)";
    if (codeEl) codeEl.textContent = window.pcgLastOrderCode || ("#PCG" + Math.floor(100000 + Math.random() * 900000));
    if (bankInfoEl) bankInfoEl.hidden = !isTransfer;

    var pointsEl = document.getElementById("thankyou-points-earned");
    if (pointsEl && window.pcgLastPointsEarned) {
      pointsEl.hidden = false;
      pointsEl.textContent = "🎉 Bạn được cộng " + window.pcgLastPointsEarned + " điểm Vòng Tay Petco!";
    }

    if (transferContentEl) {
      var n = nameInput && nameInput.value.trim();
      var p = phoneInput && phoneInput.value.trim();
      transferContentEl.textContent = (n || p) ? [n, p].filter(Boolean).join(" ") : "Tên + Số điện thoại";
    }

    if (!thankyouModal) return;
    thankyouModal.hidden = false;
    void thankyouModal.offsetHeight;
    thankyouModal.classList.add("active");
    document.body.style.overflow = "hidden";
  }

  function closeThankYou() {
    if (!thankyouModal) return;
    thankyouModal.classList.remove("active");
    document.body.style.overflow = "";
    setTimeout(function () { thankyouModal.hidden = true; }, 220);
  }

  document.getElementById("thankyou-close") && document.getElementById("thankyou-close").addEventListener("click", closeThankYou);
  document.getElementById("thankyou-backdrop") && document.getElementById("thankyou-backdrop").addEventListener("click", closeThankYou);
  document.getElementById("thankyou-ok-btn") && document.getElementById("thankyou-ok-btn").addEventListener("click", closeThankYou);

  /* ---------------------------------------------------------------------
     14. UGC carousel
     --------------------------------------------------------------------- */
  (function initUgcCarousel() {
    var row = document.getElementById("ugc-row");
    var prev = document.getElementById("ugc-prev");
    var next = document.getElementById("ugc-next");
    if (!row) return;
    function scrollByCards(dir) {
      var card = row.querySelector(".ugc-card");
      var step = card ? card.getBoundingClientRect().width + 12 : 240;
      row.scrollBy({ left: dir * step * 2, behavior: "smooth" });
    }
    if (prev) prev.addEventListener("click", function () { scrollByCards(-1); });
    if (next) next.addEventListener("click", function () { scrollByCards(1); });
  })();

  /* ---------------------------------------------------------------------
     15. Mobile nav toggle
     --------------------------------------------------------------------- */
  (function initNavToggle() {
    var toggle = document.querySelector(".nav-toggle");
    var links = document.querySelector(".nav-links");
    if (!toggle || !links) return;
    toggle.addEventListener("click", function () {
      var isOpen = links.classList.toggle("is-open");
      links.style.cssText = isOpen
        ? "display:flex;position:absolute;top:100%;left:0;right:0;flex-direction:column;background:#fff;padding:12px 20px;border-bottom:1px solid var(--border)"
        : "";
    });
  })();

  /* ---------------------------------------------------------------------
     16. Newsletter subscribe (client-side stub, không có backend)
     --------------------------------------------------------------------- */
  (function initSubscribe() {
    var form = document.querySelector(".subscribe");
    if (!form) return;
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var input = form.querySelector("input[type=email]");
      if (input && input.value.trim()) {
        input.placeholder = "Cảm ơn bạn đã đăng ký!";
        input.value = "";
      }
    });
  })();
})();

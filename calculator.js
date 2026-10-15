// Static quadcopter thrust.
// T = C_T * rho * n^2 * D^4
// C_T = ctScale * (pitch / diameter)
// Hover throttle assumes thrust scales with the square of throttle.

(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.QuadThrust = api;
  }
  if (typeof document !== "undefined") {
    bindCalculator(api);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  var GRAVITY = 9.80665;
  var RHO_SEA_LEVEL = 1.225;

  function airDensity(altitudeM) {
    var h = altitudeM;
    if (!isFiniteNumber(h)) {
      h = 0;
    }
    h = Math.min(11000, Math.max(0, h));
    var ratio = 1 - 2.25577e-5 * h;
    return RHO_SEA_LEVEL * Math.pow(ratio, 4.2561);
  }

  function loadedRpm(input) {
    if (isFiniteNumber(input.rpmOverride) && input.rpmOverride > 0) {
      return input.rpmOverride;
    }
    return input.kv * input.voltage * input.loadFactor;
  }

  function thrustCoefficient(pitchIn, diameterIn, ctScale) {
    return ctScale * (pitchIn / diameterIn);
  }

  function thrustNewtons(input) {
    var n = input.rpm / 60;
    var diameterM = input.diameterIn * 0.0254;
    return input.ct * input.rho * n * n * Math.pow(diameterM, 4);
  }

  function newtonsToGramForce(newtons) {
    return (newtons / GRAVITY) * 1000;
  }

  function gramForceToNewtons(gramForce) {
    return (gramForce / 1000) * GRAVITY;
  }

  function flightCategory(twr) {
    if (twr < 1) {
      return {
        key: "grounded",
        title: "Cannot hover",
        sentence: "Total thrust is less than the all-up weight, so this quad cannot hover.",
      };
    }
    if (twr < 1.5) {
      return {
        key: "marginal",
        title: "Marginal hover",
        sentence: "It can hover, with little spare thrust for wind or a climb.",
      };
    }
    if (twr < 2) {
      return {
        key: "cinematic",
        title: "Cinematic",
        sentence: "Enough thrust for gentle cinematic flying.",
      };
    }
    if (twr < 4) {
      return {
        key: "sport",
        title: "Sport",
        sentence: "A sport or aerial setup with room to climb.",
      };
    }
    if (twr <= 7) {
      return {
        key: "freestyle",
        title: "Freestyle",
        sentence: "In the freestyle range, with strong acceleration.",
      };
    }
    return {
      key: "racing",
      title: "Racing",
      sentence: "Racing or very light freestyle territory.",
    };
  }

  function flightPerformance(input) {
    var totalThrustG = input.thrustPerMotorG * input.motorCount;
    var twr = totalThrustG / input.weightG;
    var canHover = twr >= 1;
    return {
      totalThrustG: totalThrustG,
      thrustPerMotorG: input.thrustPerMotorG,
      twr: twr,
      canHover: canHover,
      hoverThrottle: canHover ? 100 * Math.sqrt(input.weightG / totalThrustG) : null,
      sparePayloadG: totalThrustG / 2 - input.weightG,
      category: flightCategory(twr),
    };
  }

  function estimateMotor(input) {
    var rho = airDensity(input.altitudeM);
    var rpm = loadedRpm(input);
    var ct = thrustCoefficient(input.pitchIn, input.diameterIn, input.ctScale);
    var newtons = thrustNewtons({
      rpm: rpm,
      diameterIn: input.diameterIn,
      ct: ct,
      rho: rho,
    });
    return {
      rpm: rpm,
      ct: ct,
      rho: rho,
      newtons: newtons,
      gramForce: newtonsToGramForce(newtons),
      usedOverride: isFiniteNumber(input.rpmOverride) && input.rpmOverride > 0,
    };
  }

  function isFiniteNumber(value) {
    return typeof value === "number" && Number.isFinite(value);
  }

  return {
    GRAVITY: GRAVITY,
    RHO_SEA_LEVEL: RHO_SEA_LEVEL,
    airDensity: airDensity,
    loadedRpm: loadedRpm,
    thrustCoefficient: thrustCoefficient,
    thrustNewtons: thrustNewtons,
    newtonsToGramForce: newtonsToGramForce,
    gramForceToNewtons: gramForceToNewtons,
    flightCategory: flightCategory,
    flightPerformance: flightPerformance,
    estimateMotor: estimateMotor,
  };
});

function bindCalculator(api) {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }

  function start() {
    var form = document.getElementById("calc-form");
    if (!form) {
      return;
    }

    var mode = "estimate";
    var tabs = Array.prototype.slice.call(document.querySelectorAll("[data-mode]"));

    form.addEventListener("submit", function (event) {
      event.preventDefault();
    });

    form.addEventListener("input", render);
    form.addEventListener("change", render);

    tabs.forEach(function (tab, index) {
      tab.addEventListener("click", function () {
        setMode(tab.getAttribute("data-mode"));
      });
      tab.addEventListener("keydown", function (event) {
        if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") {
          return;
        }
        event.preventDefault();
        var next = event.key === "ArrowRight" ? index + 1 : index - 1;
        if (next < 0) {
          next = tabs.length - 1;
        }
        if (next >= tabs.length) {
          next = 0;
        }
        tabs[next].focus();
        setMode(tabs[next].getAttribute("data-mode"));
      });
    });

    document.getElementById("example-estimate").addEventListener("click", loadEstimateExample);
    document.getElementById("example-measured").addEventListener("click", loadMeasuredExample);

    render();

    function setMode(nextMode) {
      mode = nextMode;
      tabs.forEach(function (tab) {
        var selected = tab.getAttribute("data-mode") === mode;
        tab.setAttribute("aria-selected", selected ? "true" : "false");
        tab.tabIndex = selected ? 0 : -1;
      });
      document.getElementById("panel-estimate").hidden = mode !== "estimate";
      document.getElementById("panel-measured").hidden = mode !== "measured";
      render();
    }

    function loadEstimateExample() {
      setValue("weight", "700");
      setValue("motors", "4");
      setValue("cells", "4");
      document.querySelector('input[name="voltage-basis"][value="4.2"]').checked = true;
      setValue("custom-voltage", "");
      setValue("kv", "2450");
      setValue("diameter", "5");
      setValue("pitch", "4.3");
      setValue("load-factor", "0.75");
      setValue("rpm-override", "");
      setValue("ct-scale", "0.16");
      setValue("altitude", "0");
      setMode("estimate");
    }

    function loadMeasuredExample() {
      setValue("weight", "700");
      setValue("motors", "4");
      setValue("thrust", "1100");
      setMode("measured");
    }

    function render() {
      syncLoadReadout();
      syncVoltageUi();

      var weightG = readNumber("weight");
      var motorCount = readNumber("motors");
      var problem = null;

      if (!(weightG > 0)) {
        problem = "Enter a positive all-up weight in grams.";
      } else if (!Number.isInteger(motorCount) || motorCount < 1) {
        problem = "Enter a whole number of motors, at least 1.";
      }

      var estimate = null;
      var thrustPerMotorG = null;

      if (!problem && mode === "estimate") {
        var parsed = readEstimateInputs();
        if (parsed.problem) {
          problem = parsed.problem;
        } else {
          estimate = api.estimateMotor(parsed.input);
          thrustPerMotorG = estimate.gramForce;
          if (!(thrustPerMotorG > 0)) {
            problem = "Enter a positive all-up weight and thrust.";
          }
        }
      }

      if (!problem && mode === "measured") {
        thrustPerMotorG = readNumber("thrust");
        if (!(thrustPerMotorG > 0)) {
          problem = "Enter a positive full-throttle thrust per motor.";
        }
      }

      if (problem) {
        showMessage(problem);
        return;
      }

      thrustPerMotorG = Math.round(thrustPerMotorG);
      var flight = api.flightPerformance({
        thrustPerMotorG: thrustPerMotorG,
        motorCount: motorCount,
        weightG: weightG,
      });
      showFlight(flight, estimate);
    }

    function readEstimateInputs() {
      var voltage = currentVoltage();
      var rpmOverride = readOptionalPositive("rpm-override");
      var kv = readNumber("kv");
      var diameterIn = readNumber("diameter");
      var pitchIn = readNumber("pitch");
      var loadFactor = readNumber("load-factor");
      var ctScale = readNumber("ct-scale");
      var altitudeM = readAltitude();

      if (rpmOverride === null) {
        return { problem: "Enter a positive tachometer RPM, or leave it blank." };
      }
      if (altitudeM === null) {
        return { problem: "Enter altitude in meters." };
      }
      if (!(diameterIn > 0) || !(pitchIn > 0) || !(ctScale > 0)) {
        return { problem: "Enter a positive propeller diameter, pitch, and thrust-coefficient scale." };
      }
      if (rpmOverride === undefined) {
        if (!(kv > 0) || !(voltage > 0) || !(loadFactor > 0)) {
          return { problem: "Enter a positive KV, pack voltage, and load factor." };
        }
      }

      return {
        input: {
          kv: kv,
          voltage: voltage,
          loadFactor: loadFactor,
          rpmOverride: rpmOverride,
          diameterIn: diameterIn,
          pitchIn: pitchIn,
          ctScale: ctScale,
          altitudeM: altitudeM,
        },
      };
    }

    function showMessage(message) {
      var readout = document.getElementById("readout");
      readout.className = "readout is-empty";
      document.getElementById("result-kicker").textContent = "Thrust-to-weight";
      document.getElementById("result-twr").textContent = "—";
      document.getElementById("result-band").textContent = "";
      document.getElementById("result-sentence").textContent = message;
      document.getElementById("result-stats").innerHTML = "";
      document.getElementById("result-model").textContent = "";
      document.getElementById("result-note").textContent = "";
    }

    function showFlight(flight, estimate) {
      var readout = document.getElementById("readout");
      readout.className = "readout is-" + flight.category.key;
      document.getElementById("result-kicker").textContent = "Thrust-to-weight";
      document.getElementById("result-twr").textContent = flight.twr.toFixed(1) + ":1";
      document.getElementById("result-band").textContent = flight.category.title;
      document.getElementById("result-sentence").textContent = flight.category.sentence;

      var perMotorNewtons = api.gramForceToNewtons(flight.thrustPerMotorG);
      var rows = [
        ["Total thrust", formatGrams(flight.totalThrustG)],
        ["Thrust per motor", formatGrams(flight.thrustPerMotorG) + " · " + formatNewtons(perMotorNewtons)],
      ];
      if (estimate) {
        rows.push([estimate.usedOverride ? "Tachometer RPM" : "Loaded RPM", formatRpm(estimate.rpm)]);
      }
      rows.push([
        "Hover throttle",
        flight.canHover ? flight.hoverThrottle.toFixed(1) + "%" : "Will not hover",
      ]);
      rows.push(["Spare payload at 2:1", formatSignedGrams(flight.sparePayloadG)]);

      document.getElementById("result-stats").innerHTML = rows
        .map(function (row) {
          return "<div><dt>" + row[0] + "</dt><dd>" + row[1] + "</dd></div>";
        })
        .join("");

      var model = document.getElementById("result-model");
      if (estimate) {
        var voltage = currentVoltage();
        var altitudeM = readAltitude();
        var bits = [];
        if (voltage > 0) {
          bits.push(formatVolts(voltage));
        }
        bits.push("C_T " + estimate.ct.toFixed(3));
        bits.push(estimate.rho.toFixed(3) + " kg/m³");
        if (altitudeM !== null && (altitudeM < 0 || altitudeM > 11000)) {
          var clamped = Math.min(11000, Math.max(0, altitudeM));
          bits.push("altitude clamped to " + clamped.toLocaleString("en-US") + " m");
        }
        model.textContent = bits.join(" · ");
      } else {
        model.textContent = "";
      }

      var note = "Cinematic through racing bands are rules of thumb.";
      if (flight.sparePayloadG < 0) {
        note += " A negative spare payload means the quad is already heavier than a 2:1 target.";
      }
      document.getElementById("result-note").textContent = note;
    }

    function syncLoadReadout() {
      var load = readNumber("load-factor");
      document.getElementById("load-readout").textContent = load === null ? "—" : load.toFixed(2);
    }

    function syncVoltageUi() {
      var custom = document.querySelector('input[name="voltage-basis"]:checked').value === "custom";
      document.getElementById("cell-field").hidden = custom;
      document.getElementById("custom-voltage-field").hidden = !custom;
      var hint = document.getElementById("voltage-hint");
      var voltage = currentVoltage();
      if (voltage > 0) {
        hint.textContent = "Using " + formatVolts(voltage) + ". Thrust falls as the pack sags.";
      } else {
        hint.textContent = "Enter the pack voltage. Thrust falls as the pack sags.";
      }
    }

    function currentVoltage() {
      var basis = document.querySelector('input[name="voltage-basis"]:checked').value;
      if (basis === "custom") {
        var customVoltage = readNumber("custom-voltage");
        if (customVoltage === null) {
          return null;
        }
        return Math.round(customVoltage * 100) / 100;
      }
      var cells = readNumber("cells");
      if (cells === null) {
        return null;
      }
      return Math.round(cells * Number(basis) * 100) / 100;
    }
  }

  function setValue(id, value) {
    document.getElementById(id).value = value;
  }

  function readNumber(id) {
    var text = document.getElementById(id).value.trim();
    if (text === "") {
      return null;
    }
    var value = Number(text);
    if (!Number.isFinite(value)) {
      return null;
    }
    return value;
  }

  function readOptionalPositive(id) {
    var text = document.getElementById(id).value.trim();
    if (text === "") {
      return undefined;
    }
    var value = Number(text);
    if (!Number.isFinite(value) || value <= 0) {
      return null;
    }
    return value;
  }

  function readAltitude() {
    var text = document.getElementById("altitude").value.trim();
    if (text === "") {
      return 0;
    }
    var value = Number(text);
    if (!Number.isFinite(value)) {
      return null;
    }
    return value;
  }

  function formatGrams(value) {
    return Math.round(value).toLocaleString("en-US") + " g";
  }

  function formatSignedGrams(value) {
    var rounded = Math.round(value);
    var abs = Math.abs(rounded).toLocaleString("en-US");
    if (rounded < 0) {
      return "−" + abs + " g";
    }
    if (rounded > 0) {
      return "+" + abs + " g";
    }
    return "0 g";
  }

  function formatRpm(value) {
    return Math.round(value).toLocaleString("en-US");
  }

  function formatNewtons(value) {
    return value.toFixed(1) + " N";
  }

  function formatVolts(value) {
    var rounded = Math.round(value * 100) / 100;
    return rounded.toFixed(2).replace(/0$/, "").replace(/\.0$/, "") + " V";
  }
}

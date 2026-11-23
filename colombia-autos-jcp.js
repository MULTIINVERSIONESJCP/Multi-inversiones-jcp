
/* COLOMBIA AUTOS — VINCULACIÓN DE VEHÍCULOS JCP
   Complemento para colombia-autos-jcp.js
   Pegar al FINAL del archivo existente.
*/
(() => {
  "use strict";

  const FUNCION = "colombia_autos_vincular_vehiculo";
  let trabajando = false;

  function cliente() {
    try {
      if (typeof supabaseClient !== "undefined") {
        return supabaseClient;
      }
      return window.supabaseClient || null;
    } catch {
      return null;
    }
  }

  function vehiculoSeleccionado() {
    const id = window.__caSelectedVehicle;
    if (id === undefined || id === null) return null;

    try {
      if (typeof data === "undefined" || !Array.isArray(data.veh)) {
        return null;
      }

      return data.veh.find(
        v => String(v.id) === String(id)
      ) || null;
    } catch {
      return null;
    }
  }

  function nombreVehiculo(v) {
    return [
      v.marca || v.m || "",
      v.ref || v.referencia || "",
      v.modelo || ""
    ].filter(Boolean).join(" ");
  }

  function mostrarMensaje(mensaje) {
    const estado = document.getElementById("ca-status");
    if (estado) estado.textContent = mensaje;
  }

  async function vincular(boton) {
    if (trabajando) return;

    const db = cliente();
    const v = vehiculoSeleccionado();

    if (!db || !v) {
      mostrarMensaje(
        "No se pudo identificar el vehículo o la sesión de JCP."
      );
      return;
    }

    const id = String(v.id);
    const nombre = nombreVehiculo(v);

    const respuesta = confirm(
      "¿Vincular " + nombre + " a Colombia Autos?\n\n" +
      "Se creará una ficha comercial OCULTA.\n" +
      "No se publicará automáticamente ni modificará otro vehículo."
    );

    if (!respuesta) return;

    trabajando = true;
    boton.disabled = true;

    try {
      if (String(window.__caSelectedVehicle) !== id) {
        throw new Error(
          "Cambió el vehículo seleccionado. Abre nuevamente su ficha."
        );
      }

      mostrarMensaje("Vinculando " + nombre + "…");

      const { data: usuario, error: errorUsuario } =
        await db.auth.getUser();

      if (errorUsuario || !usuario?.user) {
        throw new Error("Inicia sesión en JCP.");
      }

      const { error } = await db.rpc(FUNCION, {
        p_vehiculo_id: id
      });

      if (error) throw error;

      mostrarMensaje(
        "✅ " + nombre + " vinculado correctamente. " +
        "Cierra este panel y vuelve a abrir la publicación."
      );

      boton.textContent = "✅ Vehículo vinculado";

    } catch (error) {
      mostrarMensaje(
        "No se pudo vincular " + nombre + ": " +
        (error.message || String(error))
      );
      boton.disabled = false;
    } finally {
      trabajando = false;
    }
  }

  function revisarPanel() {
    const panel = document.getElementById("ca-panel");
    const estado = document.getElementById("ca-status");
    const contenedor = document.getElementById("ca-cars");

    if (!panel || !estado || !contenedor) return;

    const mensaje = estado.textContent || "";

    const necesitaVincular =
      mensaje.includes("todavía no tiene") &&
      mensaje.includes("publicación comercial");

    const anterior = document.getElementById(
      "ca-boton-vincular"
    );

    if (!necesitaVincular) {
      if (anterior) anterior.remove();
      return;
    }

    if (anterior || !vehiculoSeleccionado()) return;

    const boton = document.createElement("button");
    boton.id = "ca-boton-vincular";
    boton.type = "button";
    boton.textContent =
      "🔗 Vincular este vehículo a Colombia Autos";

    Object.assign(boton.style, {
      display: "block",
      width: "100%",
      padding: "15px",
      marginTop: "15px",
      background: "#c5a063",
      color: "#171717",
      border: "none",
      borderRadius: "10px",
      fontWeight: "bold",
      fontSize: "15px",
      cursor: "pointer"
    });

    boton.addEventListener("click", () => vincular(boton));

    contenedor.appendChild(boton);
  }

  function iniciar() {
    const observador = new MutationObserver(revisarPanel);

    observador.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });

    revisarPanel();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", iniciar, {
      once: true
    });
  } else {
    iniciar();
  }
})();

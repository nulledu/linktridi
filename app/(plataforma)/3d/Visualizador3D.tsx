"use client";

// ── Visualizador de modelo 3D ────────────────────────────────────────────────
// O palco da ficha do arquivo: rotacionar (arrastar), aproximar (rolar/pinça),
// mover (arrastar com dois dedos ou botão direito) e recentrar. É visualização
// e nada mais — modelagem não mora aqui.
//
// three.js entra por import() DENTRO do efeito: a biblioteca pesa ~600 KB e a
// biblioteca de arquivos não paga esse peso — só quem abre uma ficha
// visualizável paga, na hora em que abre.
//
// Os bytes vêm de `/api/3d/arquivos/<id>/conteudo` (same-origin de propósito:
// o redirect pro B2 morre no CORS — ver o comentário da rota).

import { useEffect, useRef, useState } from "react";
import { Botao } from "../ui/controles";
import { Momento } from "../ui/Momento";
import { tamanhoLegivel } from "@/lib/impressao3d-const";

type Estado = "carregando" | "pronto" | "erro" | "grande";

export function Visualizador3D({ arquivoId, formato, urlDownload, urlConteudo }: {
  arquivoId: string;
  formato: string;
  /** Link de download pro estado "grande demais pra pré-visualizar". */
  urlDownload: string;
  /** Banco de provas (/dev-3d): bytes de um `data:` em vez da rota com sessão. */
  urlConteudo?: string;
}) {
  const palco = useRef<HTMLDivElement | null>(null);
  const [estado, setEstado] = useState<Estado>("carregando");
  const [detalhe, setDetalhe] = useState("");
  // O "Centralizar" conversa com a cena montada no efeito.
  const recentrar = useRef<(() => void) | null>(null);

  useEffect(() => {
    const el = palco.current;
    if (!el) return;
    let vivo = true;
    let desmontar: (() => void) | null = null;
    setEstado("carregando");

    (async () => {
      const r = await fetch(urlConteudo || `/api/3d/arquivos/${arquivoId}/conteudo`).catch(() => null);
      if (!vivo) return;
      if (!r || !r.ok) {
        if (r?.status === 413) { setEstado("grande"); return; }
        setDetalhe(r ? `(${r.status})` : "(rede)");
        setEstado("erro");
        return;
      }
      const bytes = await r.arrayBuffer();
      if (!vivo) return;

      const THREE = await import("three");
      const { OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js");

      // ── Objeto a partir dos bytes, por formato ────────────────────────────
      let objeto: import("three").Object3D;
      try {
        if (formato === "stl") {
          const { STLLoader } = await import("three/examples/jsm/loaders/STLLoader.js");
          const geo = new STLLoader().parse(bytes);
          geo.computeVertexNormals();
          objeto = new THREE.Mesh(geo);
        } else if (formato === "ply") {
          const { PLYLoader } = await import("three/examples/jsm/loaders/PLYLoader.js");
          const geo = new PLYLoader().parse(bytes);
          geo.computeVertexNormals();
          objeto = new THREE.Mesh(geo);
        } else if (formato === "obj") {
          const { OBJLoader } = await import("three/examples/jsm/loaders/OBJLoader.js");
          objeto = new OBJLoader().parse(new TextDecoder().decode(bytes));
        } else if (formato === "3mf") {
          const { ThreeMFLoader } = await import("three/examples/jsm/loaders/3MFLoader.js");
          objeto = new ThreeMFLoader().parse(bytes);
        } else if (formato === "glb" || formato === "gltf") {
          const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
          const gltf = await new Promise<{ scene: import("three").Group }>((ok, erro) =>
            new GLTFLoader().parse(bytes, "", ok, erro),
          );
          objeto = gltf.scene;
        } else {
          setEstado("erro"); setDetalhe("(formato)");
          return;
        }
      } catch {
        if (vivo) { setEstado("erro"); setDetalhe("(arquivo corrompido ou fora do padrão)"); }
        return;
      }
      if (!vivo) return;

      // ── Material: a cor da PESSOA, como todo gráfico do app ───────────────
      const tinta = getComputedStyle(document.documentElement).getPropertyValue("--graf-1").trim() || "#7aa2ff";
      const material = new THREE.MeshStandardMaterial({ color: new THREE.Color(tinta), roughness: 0.55, metalness: 0.08 });
      objeto.traverse((n) => {
        const m = n as import("three").Mesh;
        // Malha sem material próprio (STL/PLY) ou com o cinza padrão do OBJ
        // ganha a tinta da casa; textura de GLB fica como veio.
        if (m.isMesh && !(m.material as import("three").MeshStandardMaterial)?.map) m.material = material;
      });

      // ── Cena ──────────────────────────────────────────────────────────────
      const cena = new THREE.Scene();
      cena.add(new THREE.HemisphereLight(0xffffff, 0x555566, 2.2));
      const sol = new THREE.DirectionalLight(0xffffff, 1.6);
      sol.position.set(1, 2, 1.5);
      cena.add(sol);

      // Centraliza o modelo na origem e deita no "chão" visual: STL de fatiador
      // costuma vir com Z pra cima; girar -90° em X põe a peça em pé na tela.
      if (formato === "stl" || formato === "ply" || formato === "3mf") objeto.rotation.x = -Math.PI / 2;
      const caixa = new THREE.Box3().setFromObject(objeto);
      const centro = caixa.getCenter(new THREE.Vector3());
      objeto.position.sub(centro);
      cena.add(objeto);

      const tamanho = caixa.getSize(new THREE.Vector3());
      const maior = Math.max(tamanho.x, tamanho.y, tamanho.z) || 1;

      const camera = new THREE.PerspectiveCamera(45, 1, maior / 100, maior * 40);
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      el.appendChild(renderer.domElement);

      const controles = new OrbitControls(camera, renderer.domElement);
      controles.enableDamping = true;
      controles.dampingFactor = 0.08;

      const posInicial = () => {
        camera.position.set(maior * 1.1, maior * 0.8, maior * 1.4);
        controles.target.set(0, 0, 0);
        controles.update();
      };
      posInicial();
      recentrar.current = posInicial;

      const medir = () => {
        const w = el.clientWidth, h = el.clientHeight;
        if (!w || !h) return;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      };
      medir();
      const ro = new ResizeObserver(medir);
      ro.observe(el);

      // Desenha por demanda: parado, o palco não gasta GPU — só quando os
      // controles mexem (damping incluso) ou o tamanho muda.
      let quadro = 0;
      const desenhar = () => {
        quadro = 0;
        controles.update();
        renderer.render(cena, camera);
      };
      const pedir = () => { if (!quadro) quadro = requestAnimationFrame(desenhar); };
      controles.addEventListener("change", pedir);
      // O damping continua andando alguns quadros depois do gesto.
      const emGesto = { v: false };
      controles.addEventListener("start", () => { emGesto.v = true; laco(); });
      controles.addEventListener("end", () => { emGesto.v = false; });
      let lacoId = 0;
      const laco = () => {
        desenhar();
        if (emGesto.v) lacoId = requestAnimationFrame(laco);
      };
      const roDesenho = new ResizeObserver(pedir);
      roDesenho.observe(el);
      desenhar();
      setEstado("pronto");

      desmontar = () => {
        ro.disconnect();
        roDesenho.disconnect();
        cancelAnimationFrame(quadro);
        cancelAnimationFrame(lacoId);
        controles.dispose();
        renderer.dispose();
        renderer.domElement.remove();
        cena.traverse((n) => {
          const m = n as import("three").Mesh;
          if (m.isMesh) {
            m.geometry?.dispose();
            const mats = Array.isArray(m.material) ? m.material : [m.material];
            mats.forEach((mm) => mm?.dispose());
          }
        });
      };
    })().catch(() => { if (vivo) { setEstado("erro"); setDetalhe(""); } });

    return () => { vivo = false; recentrar.current = null; desmontar?.(); };
  }, [arquivoId, formato, urlConteudo]);

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div
        ref={palco}
        style={{
          position: "relative",
          height: "min(52dvh, 480px)",
          borderRadius: 16,
          border: "1px solid var(--border)",
          background: "var(--surface-2, var(--surface))",
          overflow: "hidden",
          // O palco come o gesto: sem isto, arrastar o modelo no celular rola a folha.
          touchAction: "none",
          display: "grid",
          placeItems: "center",
        }}
      >
        {estado === "carregando" && (
          <span style={{ fontSize: 13, color: "var(--text-dim)" }}>Montando o modelo…</span>
        )}
        {estado === "erro" && (
          <Momento compacto icone="alert-triangle" tom="erro" titulo="Não deu pra montar a visualização"
            texto={`O arquivo abre normalmente pelo download. ${detalhe}`.trim()} />
        )}
        {estado === "grande" && (
          <Momento compacto icone="file-description" titulo="Grande demais pra pré-visualizar"
            texto={`Acima de ${tamanhoLegivel(120 * 1024 * 1024)} o modelo não é montado aqui — baixe pra abrir no fatiador.`}
            acao={<a href={urlDownload} download><Botao variante="secundario" icone="download">Baixar arquivo</Botao></a>} />
        )}
      </div>
      {estado === "pronto" && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <Botao variante="sutil" tamanho="sm" icone="target" onClick={() => recentrar.current?.()}>Centralizar</Botao>
          <span style={{ fontSize: 12, color: "var(--text-dim)" }}>
            Arraste pra girar · role ou faça pinça pra aproximar · dois dedos movem
          </span>
        </div>
      )}
    </div>
  );
}

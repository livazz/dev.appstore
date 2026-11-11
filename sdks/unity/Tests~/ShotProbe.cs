// Captures d'écran de l'interface intégrée, prises dans un vrai build (voir SdkTools.BuildShotPlayer).
// Écrit dans `outDir` : bouton.png (bouton « Boutique web »), code.png (écran du code de liaison), shots.txt (le code).
using System.Collections;
using System.IO;
using DevAppStore;
using UnityEngine;

[DefaultExecutionOrder(-1000)]
public class ShotProbe : MonoBehaviour
{
    public string outDir;

    private void Awake()
    {
        Application.runInBackground = true; // lancé sans le focus, le jeu se mettrait en pause
        PlayerPrefs.DeleteAll();
        Directory.CreateDirectory(outDir);
    }

    private IEnumerator Start()
    {
        var drop = GameObject.Find("DevAppStore").GetComponent<DevAppStoreDropIn>();
        string code = null;
        drop.onLinkCode.AddListener(c => code = c);
        yield return new WaitForSecondsRealtime(1f);
        ScreenCapture.CaptureScreenshot(Path.Combine(outDir, "bouton.png"));
        yield return new WaitForSecondsRealtime(0.5f);

        drop.OpenLinkPanel(); // comme un appui sur le bouton
        float deadline = Time.realtimeSinceStartup + 20f;
        while (code == null && Time.realtimeSinceStartup < deadline) yield return null;
        yield return new WaitForSecondsRealtime(0.5f);
        ScreenCapture.CaptureScreenshot(Path.Combine(outDir, "code.png"));
        yield return new WaitForSecondsRealtime(1f);
        File.WriteAllText(Path.Combine(outDir, "shots.txt"), code ?? "PAS DE CODE");
        Application.Quit();
    }
}

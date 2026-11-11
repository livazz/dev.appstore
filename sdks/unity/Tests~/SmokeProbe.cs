// Sonde de l'essai de bout en bout (voir SdkTools.RunSmoke). Écrit dans `outDir` :
//   code.txt     le code de liaison affiché au joueur
//   linked.txt   dès que le compte est lié
//   granted.txt  une ligne « product_id quantité » par achat reçu (revoked.txt pour les remboursements)
//   errors.txt   les erreurs du client
//   result.txt   OK ou TIMEOUT, juste avant de quitter l'éditeur (code de sortie 0 ou 3)
using System.Collections;
using System.IO;
using DevAppStore;
using UnityEngine;

[DefaultExecutionOrder(-1000)]
public class SmokeProbe : MonoBehaviour
{
    public string outDir;
    private bool _granted;

    private void Awake()
    {
        PlayerPrefs.DeleteAll(); // appareil neuf : ni identifiant, ni jeton joueur
        Directory.CreateDirectory(outDir);
    }

    public void Grant(string productId, int quantity)
    {
        File.AppendAllText(Path.Combine(outDir, "granted.txt"), productId + " " + quantity + "\n");
        _granted = true;
    }

    public void Revoke(string productId, int quantity)
    {
        File.AppendAllText(Path.Combine(outDir, "revoked.txt"), productId + " " + quantity + "\n");
    }

    private IEnumerator Start()
    {
        var drop = GameObject.Find("DevAppStore").GetComponent<DevAppStoreDropIn>();
        drop.onLinkCode.AddListener(code => File.WriteAllText(Path.Combine(outDir, "code.txt"), code));
        drop.onLinked.AddListener(() => File.WriteAllText(Path.Combine(outDir, "linked.txt"), "1"));
        drop.Client.OnError += e => File.AppendAllText(Path.Combine(outDir, "errors.txt"), e + "\n");
        yield return null;
        drop.OpenLinkPanel(); // comme un appui sur « Boutique web »

        float deadline = Time.realtimeSinceStartup + 240f;
        while (!_granted && Time.realtimeSinceStartup < deadline) yield return new WaitForSecondsRealtime(0.25f);
        yield return new WaitForSecondsRealtime(3f); // laisse partir l'accusé de réception
        File.WriteAllText(Path.Combine(outDir, "result.txt"), _granted ? "OK" : "TIMEOUT");
#if UNITY_EDITOR
        UnityEditor.EditorApplication.Exit(_granted ? 0 : 3);
#endif
    }
}
